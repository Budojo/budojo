<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Auth\CanResetPassword;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
    }

    public function boot(): void
    {
        // Non-production safety net (#458). Hijacks every Mailable's
        // recipient list and redirects them to the configured test
        // address, so a misconfigured `MAIL_MAILER=resend` (or any
        // other live driver) in a dev / staging env can't accidentally
        // ship real mail to real customers. Production is excluded
        // — `app()->environment('production')` is the only place
        // where recipients land verbatim.
        //
        // The redirect target defaults to the support inbox so a dev
        // can still see what their changes look like end-to-end. Set
        // `MAIL_TEST_REDIRECT=null` (or empty) in `.env` to opt out
        // and let the configured driver send to the real recipient
        // — useful when smoke-testing the actual deliverability path.
        if (! $this->app->environment('production')) {
            $redirect = config('mail.test_redirect');
            if (\is_string($redirect) && $redirect !== '') {
                Mail::alwaysTo($redirect);
            }
        }

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

            // Eloquent attributes go through __get magic, so
            // property_exists() returns false on a real User model and
            // the URL would ship without an email — breaking the SPA's
            // reset flow (no email = invalid-link panel). Use the
            // CanResetPassword contract method instead, which is what
            // the User model implements via the Authenticatable +
            // CanResetPassword traits.
            $email = $user instanceof CanResetPassword ? $user->getEmailForPasswordReset() : '';

            return $base . '/auth/reset-password?token=' . urlencode($token) . '&email=' . urlencode($email);
        });
    }
}
