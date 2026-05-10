<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginUserAction;
use App\Actions\Auth\RecordLoginAttemptAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\TwoFactorAuth;
use App\Support\UserAgentLabel;
use Illuminate\Http\JsonResponse;

class LoginController extends Controller
{
    public function __construct(
        private readonly LoginUserAction $action,
        private readonly RecordLoginAttemptAction $recordAttempt,
    ) {
    }

    public function __invoke(LoginRequest $request): JsonResponse
    {
        $email = $request->string('email')->toString();
        $ip = $request->ip();
        $userAgent = $request->userAgent();

        $result = $this->action->execute(
            email: $email,
            password: $request->string('password')->toString(),
        );

        // Login-history audit log (#430). Records EVERY attempt —
        // success or failure — with email, IP, and User-Agent so
        // the user's "Login history" panel can surface the
        // compromise signal (failed-login bursts are the high-signal
        // security event to detect).
        //
        // **Wrong-password attribution**: the LoginResult carries
        // `matchedUserId` even on failure (when the email matched a
        // real account but the password was wrong) so the audit row
        // attributes to that user — the failure surfaces in THEIR
        // /me/login-history. The HTTP 401 response shape is identical
        // to the unknown-email branch so the attribution does NOT
        // leak account-existence to the caller.
        //
        // Wrapped so a hiccup in the audit insert never blocks a
        // legitimate login.
        try {
            $this->recordAttempt->execute(
                userId: $result->matchedUserId,
                emailAttempted: $email,
                ip: $ip,
                userAgent: $userAgent,
                success: $result->isSuccess(),
            );
        } catch (\Throwable $e) {
            report($e);
        }

        $user = $result->user;
        if ($user === null) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        // Two-factor challenge (#412). When the user has 2FA active
        // (confirmed_at is set), password validation is necessary
        // but NOT sufficient — the body must also carry a valid
        // `two_factor_code` (TOTP from the authenticator OR a
        // single-use backup code). Three failure modes return 422
        // with distinct messages so the SPA can render the right
        // shape (prompt for code vs prompt for new code).
        if ($user->two_factor_confirmed_at !== null) {
            $code = $request->string('two_factor_code')->toString();
            if ($code === '') {
                return response()->json(
                    ['message' => 'two_factor_required'],
                    422,
                );
            }
            if (! $this->verifyTwoFactor($user, $code)) {
                return response()->json(
                    ['message' => 'invalid_two_factor_code'],
                    422,
                );
            }
        }

        // Token name surfaces in the user's "Active sessions" list
        // (#413) — derive a coarse "Chrome on macOS"-style label from
        // the User-Agent header so the row is human-readable.
        // Fallback "Unknown device" when the header is missing or
        // unparseable. Truncated to 80 chars in the helper to stay
        // well under the column's 255 limit.
        $tokenName = UserAgentLabel::fromUserAgent($request->userAgent() ?? '');
        $token = $user->createToken($tokenName)->plainTextToken;

        // Eager-load the relations the `UserResource` projects so the
        // wire envelope reflects reality immediately on login. Without
        // this, a user already in the 30-day grace window (#223) or
        // with an outstanding email-change request (#476) would see
        // the corresponding block as `null` and only learn the true
        // state from the next /auth/me bootstrap call. Two indexed
        // queries against small tables (#255 caught the first half).
        $user->load(['pendingDeletion', 'pendingEmailChange']);

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
        );
    }

    /**
     * Accepts either a 6-digit TOTP OR an 8-char backup code (with
     * or without the canonical dash). Tries the cheaper TOTP check
     * first; falls through to backup-code consumption on miss.
     *
     * On a backup-code match the matched code is removed from the
     * stored array (`array_filter` + persist) so it can't be reused.
     */
    private function verifyTwoFactor(User $user, string $code): bool
    {
        $secret = $user->two_factor_secret;
        if ($secret !== null && TwoFactorAuth::verifyTotp($secret, $code)) {
            return true;
        }

        $codes = $user->two_factor_recovery_codes ?? [];
        $remaining = TwoFactorAuth::consumeRecoveryCode($codes, $code);
        if ($remaining === null) {
            return false;
        }

        $user->forceFill(['two_factor_recovery_codes' => $remaining])->save();

        return true;
    }
}
