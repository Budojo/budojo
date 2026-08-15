<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginUserAction;
use App\Actions\Auth\MintSessionTokenAction;
use App\Actions\Auth\RecordLoginAttemptAction;
use App\Actions\Auth\VerifyTwoFactorAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Support\UserAgentLabel;
use Illuminate\Http\JsonResponse;

class LoginController extends Controller
{
    public function __construct(
        private readonly LoginUserAction $action,
        private readonly RecordLoginAttemptAction $recordAttempt,
        private readonly VerifyTwoFactorAction $verifyTwoFactor,
        private readonly MintSessionTokenAction $mintToken,
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

        $user = $result->user;
        if ($user === null) {
            // Wrong-password or unknown-email path — log the failed
            // attempt with the matched-id (if any) for /me/login-history
            // attribution, then 401. Audit insert is best-effort: a
            // DB hiccup never blocks the response.
            $this->recordAttemptSafely(
                userId: $result->matchedUserId,
                email: $email,
                ip: $ip,
                userAgent: $userAgent,
                success: false,
            );

            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        // Two-factor challenge (#412). Password is correct, but when
        // the user has 2FA active (confirmed_at is set), the body
        // must ALSO carry a valid `two_factor_code` (TOTP from the
        // authenticator OR a single-use backup code). Two failure
        // modes return 422 with distinct messages so the SPA can
        // render the right shape (prompt for code vs prompt for new
        // code). A missing or wrong code on a 2FA-active account is
        // logged as a failed attempt so a bruteforce-the-code probe
        // surfaces in the user's login-history panel.
        if ($user->two_factor_confirmed_at !== null) {
            $code = $request->string('two_factor_code')->toString();
            if ($code === '') {
                return response()->json(
                    ['message' => 'two_factor_required'],
                    422,
                );
            }
            if (! $this->verifyTwoFactor->execute($user, $code)) {
                $this->recordAttemptSafely(
                    userId: $user->id,
                    email: $email,
                    ip: $ip,
                    userAgent: $userAgent,
                    success: false,
                );

                return response()->json(
                    ['message' => 'invalid_two_factor_code'],
                    422,
                );
            }
        }

        // Real success — both password AND (if active) 2FA passed.
        $this->recordAttemptSafely(
            userId: $user->id,
            email: $email,
            ip: $ip,
            userAgent: $userAgent,
            success: true,
        );

        // Token name surfaces in the user's "Active sessions" list
        // (#413) — derive a coarse "Chrome on macOS"-style label from
        // the User-Agent header so the row is human-readable.
        // Fallback "Unknown device" when the header is missing or
        // unparseable. Truncated to 80 chars in the helper to stay
        // well under the column's 255 limit.
        $tokenName = UserAgentLabel::fromUserAgent($request->userAgent() ?? '');
        $token = $this->mintToken->execute($user, $tokenName);

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
     * Best-effort audit insert. Mirrors the prior try/catch shape —
     * a DB hiccup in the audit insert never blocks the response.
     */
    private function recordAttemptSafely(
        ?int $userId,
        string $email,
        ?string $ip,
        ?string $userAgent,
        bool $success,
    ): void {
        try {
            $this->recordAttempt->execute(
                userId: $userId,
                emailAttempted: $email,
                ip: $ip,
                userAgent: $userAgent,
                success: $success,
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
