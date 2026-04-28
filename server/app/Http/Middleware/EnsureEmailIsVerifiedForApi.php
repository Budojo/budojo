<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * API variant of Laravel's built-in `verified` middleware. Returns a JSON
 * 403 with the stable `verification_required` message instead of trying to
 * redirect to a named route — the SPA's `authInterceptor` keys on the exact
 * message string to route the user to `/dashboard/profile?reason=verify_required`.
 */
class EnsureEmailIsVerifiedForApi
{
    public function handle(Request $request, \Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof MustVerifyEmail && ! $user->hasVerifiedEmail()) {
            return new JsonResponse(['message' => 'verification_required'], 403);
        }

        return $next($request);
    }
}
