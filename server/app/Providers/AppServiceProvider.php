<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
    }

    public function boot(): void
    {
        // One verification-email resend per minute per authenticated user.
        // Falls back to IP for unauthenticated callers (defensive — the
        // route is auth-gated, but the limiter works either way).
        RateLimiter::for('email-verification-resend', fn (Request $request): Limit => Limit::perMinute(1)->by(
            $request->user()?->getAuthIdentifier() ?? $request->ip() ?? 'unknown',
        ));

        // Six password-reset requests per minute per IP (M5 PR-A,
        // PRD §user-story-6). Any single user hitting the form
        // repeatedly stays unblocked enough to retry through email
        // delivery hiccups, but a script can't blast the mail vendor
        // at our expense.
        RateLimiter::for('password-reset-request', fn (Request $request): Limit => Limit::perMinute(6)->by(
            $request->ip() ?? 'unknown',
        ));

        // Reshape the password-reset URL embedded in the email to
        // point at the SPA's `/auth/reset-password` route instead of
        // a server-rendered Laravel page. Same APP_URL → CLIENT_URL
        // pattern as the email-verification redirect (see
        // EmailVerificationController::clientUrl()). The token + email
        // are passed as query string params so the SPA can pre-fill
        // the form.
        ResetPassword::createUrlUsing(function (mixed $user, string $token): string {
            $clientUrl = config('app.client_url');
            $base = \is_string($clientUrl) ? rtrim($clientUrl, '/') : 'http://localhost:4200';
            $email = '';
            if (\is_object($user) && property_exists($user, 'email')) {
                /** @var mixed $userEmail */
                $userEmail = $user->email;
                $email = \is_string($userEmail) ? $userEmail : '';
            }

            return $base . '/auth/reset-password?token=' . urlencode($token) . '&email=' . urlencode($email);
        });
    }
}
