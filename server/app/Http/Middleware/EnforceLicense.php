<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Actions\License\GetLicenseStateAction;
use App\Enums\Capability;
use App\Support\Capabilities;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses writes once the trial or the activated key has run out (#1290).
 *
 * This is the enforcement. Greying a button out is presentation — anyone who
 * opens devtools can click it anyway — so the API is where "you cannot do this
 * yet" has to be true. Answers 402 with the stable `license_required` code the
 * SPA's error interceptor keys on, matching `role_required` and
 * `verification_required`.
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

        return ! $request->is(...$this->exemptPatterns());
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
