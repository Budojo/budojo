<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ConfirmEmailChangeAction;
use App\Exceptions\EmailChangeTokenInvalidException;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class EmailVerificationController extends Controller
{
    public function __construct(
        private readonly ConfirmEmailChangeAction $confirmEmailChange,
    ) {
    }

    /**
     * Resend the verification email to the authenticated user. Idempotent —
     * already-verified users get 204 with no notification dispatched.
     * Rate-limited via the `email-verification-resend` named limiter
     * (one request per minute per user; see AppServiceProvider).
     */
    public function resend(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->noContent();
        }

        $user->sendEmailVerificationNotification();

        return response()->noContent();
    }

    /**
     * Handle the signed-link callback from the verification email. The signed
     * middleware guards the URL signature; we additionally verify the hash
     * matches the user's current email (catches the post-signature email-
     * change case). The route is intentionally NOT behind `auth:sanctum` —
     * the user clicks the link from their inbox, often on a different device
     * or browser session than the one that registered. The signed URL IS
     * the authentication.
     */
    public function verify(Request $request, int $id, string $hash): RedirectResponse
    {
        $user = User::find($id);

        if ($user === null) {
            return $this->redirectToError();
        }

        if (! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return $this->redirectToError();
        }

        if (! $user->hasVerifiedEmail() && $user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return redirect($this->clientUrl() . '/auth/verify-success');
    }

    /**
     * Public verify endpoint for an email-change token (#476). The token
     * in the URL IS the auth — same shape as the athlete-invite preview
     * endpoint. Returns 200 with a stable `{message}` body on success;
     * 410 Gone (with the same stable string the action throws) on
     * expired / consumed / unknown token.
     *
     * Deliberately does NOT auto-login — the conservative anti-leak
     * choice. The SPA's verify-email-change page renders a confirmed
     * panel + bounces to `/auth/login`.
     */
    public function verifyChange(string $token): JsonResponse
    {
        try {
            $this->confirmEmailChange->execute($token);
        } catch (EmailChangeTokenInvalidException $e) {
            return response()->json(
                ['message' => $e->getMessage()],
                SymfonyResponse::HTTP_GONE,
            );
        }

        return response()->json(['message' => 'email_change_confirmed']);
    }

    private function redirectToError(): RedirectResponse
    {
        return redirect($this->clientUrl() . '/auth/verify-error');
    }

    private function clientUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        // Strip a trailing slash so concatenation with `/auth/verify-success`
        // never produces `https://app.test//auth/...`. Browsers normalize
        // double-slashes silently but that's a fragile contract — defensive
        // here is cheap (#174 follow-up to #173 review).
        return rtrim($resolved, '/');
    }
}
