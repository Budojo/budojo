<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\Capability;
use App\Support\Capabilities;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route gate for a runtime capability (#1229): `capability:community`.
 *
 * Answers 404, not 403. A 403 says "this exists and you may not"; on a runtime
 * that has no community at all the honest answer is that there is nothing
 * here — and a hidden surface should not advertise itself to whoever is
 * probing the local port.
 */
class RequireCapability
{
    public function handle(Request $request, \Closure $next, string $capability): Response
    {
        $required = Capability::tryFrom($capability);

        if ($required === null) {
            throw new \InvalidArgumentException("Unknown capability '{$capability}' in route middleware.");
        }

        if (Capabilities::lacks($required)) {
            return new JsonResponse(['message' => 'Not Found.'], 404);
        }

        return $next($request);
    }
}
