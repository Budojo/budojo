<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Actions\License\GetLicenseStateAction;
use App\Enums\Capability;
use App\Support\Capabilities;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses writes once the trial or the activated key has run out (#1290).
 *
 * This is the enforcement. Greying a button out is presentation — anyone who
 * opens devtools can click it anyway — so the API is where "you cannot do this
 * yet" has to be true. Answers 402 with a stable `license_required` code in the
 * shape of `role_required` and `verification_required`, so the SPA's error
 * interceptor can key on it the same way once the client slice lands.
 *
 * Applied to the whole API group rather than to individual routes, so a route
 * added next month is covered without anyone remembering to cover it. What
 * stays writable is therefore an explicit list in `config/budojo.license.exempt`
 * — a decision someone had to make on purpose, not one made by forgetting.
 *
 * Reads are never blocked, and neither are the scheduled jobs behind the
 * owner's back: backups keep running and certificate reminders keep firing on a
 * lapsed instance. Their data is on their machine and stays safe there; the
 * licence buys the ability to keep putting more in.
 */
class EnforceLicense
{
    /**
     * Methods that change something. HEAD/GET/OPTIONS pass untouched — an
     * expired licence must never make the owner's own records unreadable.
     */
    private const array WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function __construct(private readonly GetLicenseStateAction $state)
    {
    }

    public function handle(Request $request, \Closure $next): Response
    {
        if (! $this->applies($request)) {
            return $next($request);
        }

        if ($this->state->execute()->allowsWrites()) {
            return $next($request);
        }

        return new JsonResponse(['message' => 'license_required'], 402);
    }

    /**
     * Ordered cheapest-first: the config lookups settle almost every request
     * before anything queries the database.
     */
    private function applies(Request $request): bool
    {
        if (Capabilities::lacks(Capability::Licensing)) {
            return false;
        }

        if (! \in_array($request->getMethod(), self::WRITE_METHODS, true)) {
            return false;
        }

        if ($this->routeIsAbsentHere($request)) {
            return false;
        }

        return ! $request->is(...$this->exemptPatterns());
    }

    /**
     * True when the route is behind a `capability:` this runtime lacks.
     *
     * Group middleware runs before route middleware, so without this check the
     * licence answer would reach a caller first and reply "pay to unlock" about
     * a surface that does not exist here at all. `RequireCapability` says a
     * runtime's missing surfaces must not advertise themselves; letting the 404
     * win keeps that true, and keeps the two gates from contradicting each
     * other in the docs.
     */
    private function routeIsAbsentHere(Request $request): bool
    {
        $route = $request->route();

        if (! $route instanceof Route) {
            return false;
        }

        foreach ($route->gatherMiddleware() as $middleware) {
            if (! \is_string($middleware) || ! str_starts_with($middleware, 'capability:')) {
                continue;
            }

            $required = Capability::tryFrom(substr($middleware, \strlen('capability:')));

            if ($required !== null && Capabilities::lacks($required)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function exemptPatterns(): array
    {
        /** @var mixed $configured */
        $configured = config('budojo.license.exempt', []);

        if (! \is_array($configured)) {
            return [];
        }

        return array_values(array_filter($configured, \is_string(...)));
    }
}
