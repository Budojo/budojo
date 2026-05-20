<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Aliases for route-layer middleware:
        //   verified.api → JSON 403 with `verification_required` (see
        //                   EnsureEmailIsVerifiedForApi for the rationale
        //                   vs Laravel's bundled HTML-shaped `verified`).
        //   role         → JSON 403 with `role_required` (#774 / M7 PR-F);
        //                   parameterised: `role:owner` or `role:athlete`.
        //                   The SPA's error interceptor keys on the body
        //                   string to drop the caller off the offending
        //                   surface.
        $middleware->alias([
            'verified.api' => \App\Http\Middleware\EnsureEmailIsVerifiedForApi::class,
            'role' => \App\Http\Middleware\EnsureUserHasRole::class,
        ]);

        // Disable the framework default guest-redirect callback (#769).
        // `ApplicationBuilder` registers `redirectGuestsTo(fn () =>
        // route('login'))` by default. We have no `login` route in this
        // API-only Laravel app, so the lookup throws
        // `RouteNotFoundException` — and the exception happens INSIDE
        // `Authenticate::unauthenticated()` while CONSTRUCTING the
        // `AuthenticationException` (the redirect URL is computed as a
        // ternary arg to the constructor), so the
        // `AuthenticationException` is never thrown to begin with and
        // the `shouldRenderJsonWhen` callback in `withExceptions` below
        // never sees it. Setting `redirectGuestsTo(null)` short-circuits
        // the redirect path: `Authenticate::redirectTo()` returns null,
        // the `AuthenticationException` is constructed with
        // `redirectTo = null`, and the Handler's `unauthenticated()`
        // routes to the JSON 401 branch (gated by `shouldReturnJson`,
        // which now fires with our callback for `/api/*`). Net effect:
        // every `/api/*` 401 returns `{"message":"Unauthenticated."}`
        // regardless of Accept header.
        $middleware->redirectGuestsTo(null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Force JSON rendering for every `/api/*` request regardless of
        // its Accept header (#769). Without this, Laravel's default
        // `Handler::unauthenticated()` falls through to
        // `redirect()->guest($this->redirectGuestsTo)` and the
        // framework default `redirectGuestsTo` is
        // `fn () => route('login')` (see
        // `Foundation/Configuration/ApplicationBuilder::redirectGuestsTo`).
        // We have no `login` route in this API-only setup, so the
        // redirect target lookup throws `RouteNotFoundException` and
        // the framework renders the generic HTML 500 page +
        // `production.ERROR` accumulates in `storage/logs/laravel.log`
        // on every probe (uptime monitor, bot crawl, curl without
        // `-H Accept: application/json`).
        //
        // `unauthenticated()` consults `shouldReturnJson()` BEFORE the
        // redirect branch (see `Handler.php:786`), and
        // `shouldReturnJson()` honours `shouldRenderJsonWhen` (see
        // `Handler.php:853-857`). Matching `api/*` here therefore short-
        // circuits the broken redirect path and returns the canonical
        // `{"message":"Unauthenticated."}` JSON 401 — same envelope the
        // SPA's auth interceptor already keys on for the explicit-Accept
        // happy path.
        //
        // `expectsJson()` is OR'd in so non-`api/*` callers that
        // explicitly ask for JSON keep getting JSON, matching the
        // pre-fix behaviour for those paths.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Tampered or expired signed URLs on the email-verification callback
        // should bounce the user to the SPA's verify-error page so they can
        // request a fresh link. Without this they'd see a bare 403, which
        // looks like the app is broken from the user's POV.
        $exceptions->render(function (InvalidSignatureException $e, $request) {
            if ($request->is('api/v1/email/verify/*')) {
                $url = config('app.client_url');
                $resolved = \is_string($url) ? $url : 'http://localhost:4200';

                // rtrim guards against a trailing-slash CLIENT_URL producing
                // `https://app.test//auth/verify-error` — same defensive
                // pattern used in EmailVerificationController::clientUrl()
                // (#174 follow-up to #173 review).
                return redirect(rtrim($resolved, '/').'/auth/verify-error');
            }

            return null;
        });
    })->create();
