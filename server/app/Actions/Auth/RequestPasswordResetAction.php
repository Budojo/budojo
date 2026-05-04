<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use Illuminate\Support\Facades\Password;

class RequestPasswordResetAction
{
    /**
     * Trigger a password-reset email for the given address. Idempotent
     * by design: if no user exists for $email, the broker returns
     * silently and we don't expose that signal to the caller — the
     * controller responds 202 either way so an attacker can't enumerate
     * registered accounts (M5 PRD § PR-A user story #7).
     *
     * The actual email body + URL is delivered by Laravel's built-in
     * `Illuminate\Auth\Notifications\ResetPassword` notification; the
     * URL is reshaped to point at the SPA's `/auth/reset-password`
     * route via `ResetPassword::createUrlUsing()` in
     * `AppServiceProvider::boot()`.
     */
    public function execute(string $email): void
    {
        Password::sendResetLink(['email' => $email]);
    }
}
