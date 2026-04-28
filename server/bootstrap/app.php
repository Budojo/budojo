<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Routing\Exceptions\InvalidSignatureException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Tampered or expired signed URLs on the email-verification callback
        // should bounce the user to the SPA's verify-error page so they can
        // request a fresh link. Without this they'd see a bare 403, which
        // looks like the app is broken from the user's POV.
        $exceptions->render(function (InvalidSignatureException $e, $request) {
            if ($request->is('api/v1/email/verify/*')) {
                return redirect(config('app.client_url').'/auth/verify-error');
            }

            return null;
        });
    })->create();
