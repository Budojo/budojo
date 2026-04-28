<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    /**
     * Resend the verification email to the authenticated user. Idempotent —
     * already-verified users get 204 with no notification dispatched.
     * Rate-limited via the `email-verification-resend` named limiter
     * (one request per minute per user; see AppServiceProvider).
     */
    public function resend(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(status: 204);
        }

        $user->sendEmailVerificationNotification();

        return response()->json(status: 204);
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

    private function redirectToError(): RedirectResponse
    {
        return redirect($this->clientUrl() . '/auth/verify-error');
    }

    private function clientUrl(): string
    {
        $url = config('app.client_url');

        return \is_string($url) ? $url : 'http://localhost:4200';
    }
}
