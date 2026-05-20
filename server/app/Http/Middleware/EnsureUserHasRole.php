<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\UserRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side role gate (#774, M7 epic #445 PR-F). Applied as
 * `role:owner` (or `role:athlete`) on route groups in `api_v1.php`.
 *
 * Returns a JSON 403 with the stable `role_required` message when the
 * authenticated user's `users.role` doesn't match the required role.
 * The SPA's `error.interceptor.ts` keys on the exact string to route
 * the user away from the offending surface (parallel to the
 * `verification_required` discipline in `EnsureEmailIsVerifiedForApi`).
 *
 * Sits AFTER `auth:sanctum` in the middleware stack — an unauthenticated
 * caller has already been bounced to 401 by the time this middleware
 * runs, so the `$request->user()` cast is safe.
 *
 * Why we don't 404 instead of 403: the route exists, the caller is
 * authenticated, the academy-scope check would also pass for an
 * authorised peer. The right semantic is "you can't do this" → 403.
 * 404 would also leak less information, but the stable error code
 * lets the SPA distinguish role-failure from missing resources and
 * sign the user out of the surface gracefully.
 */
class EnsureUserHasRole
{
    public function handle(Request $request, \Closure $next, string $role): Response
    {
        $user = $request->user();

        // Defensive: `auth:sanctum` ahead of this middleware would have
        // 401'd a missing user. The null check is a belt-and-braces
        // backstop so a misconfigured route (this middleware applied
        // without `auth:sanctum`) doesn't silently let everyone through.
        if ($user === null) {
            return new JsonResponse(['message' => 'role_required'], 403);
        }

        $required = UserRole::tryFrom($role);
        if ($required === null) {
            // A typo in the route definition (`role:ownerr`) shouldn't
            // open the gate — fail closed.
            return new JsonResponse(['message' => 'role_required'], 403);
        }

        if ($user->role !== $required) {
            return new JsonResponse(['message' => 'role_required'], 403);
        }

        return $next($request);
    }
}
