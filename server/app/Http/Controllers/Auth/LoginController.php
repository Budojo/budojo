<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginUserAction;
use App\Actions\Auth\RecordLoginAttemptAction;
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
}
