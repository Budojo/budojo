<?php

declare(strict_types=1);

namespace App\Providers;

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
    }
}
