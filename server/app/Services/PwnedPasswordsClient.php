<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Client\Factory as HttpClientFactory;
use Illuminate\Support\Facades\Cache;

/**
 * Thin HTTP client around the HaveIBeenPwned k-anonymity API (#415).
 *
 * The pwnedpasswords endpoint returns ~600 hash suffixes per 5-char
 * SHA-1 prefix, so the client query (the `prefix`) leaks no
 * information about the password being checked. The API response
 * format is `lines of "{suffix}:{count}"`.
 *
 * Rationale for the design:
 *
 * - **Cache the per-prefix response, not the per-password verdict.**
 *   Hash suffixes for the same prefix are shared across multiple
 *   future password checks — caching the bucket means subsequent
 *   lookups for any password whose SHA-1 starts with that prefix
 *   resolve from cache. We never store the plaintext password or
 *   its full SHA-1 anywhere; the cache key is the 5-char prefix
 *   only, which is non-reversible and matches what the API itself
 *   stores client-side.
 * - **Soft-fail on upstream outages.** A timed-out / 5xx pwned API
 *   must not block our register / reset / change-password flow —
 *   `report()` the exception and treat the password as not-known-
 *   breached. Better to soft-allow than to outage our auth surface
 *   on a third-party hiccup.
 * - **Short connect timeout (3s).** The strength meter on the SPA
 *   is non-blocking; the server-side rule only fires on submit, so
 *   3s is a humane upper bound before we soft-fail.
 *
 * Bound as a singleton in `AppServiceProvider::register()` so the
 * client instance is shared for the process lifetime. The cache
 * itself (`Cache::*`) is already process-external, but the singleton
 * also saves the `HttpClientFactory` wire-up on every password-
 * validation hit.
 */
class PwnedPasswordsClient
{
    /** Pwned-passwords k-anonymity API. */
    private const string ENDPOINT = 'https://api.pwnedpasswords.com/range/';

    /** Per-prefix cache TTL — 24h matches the issue brief. */
    private const int CACHE_TTL_SECONDS = 86400;

    /** HTTP connect+request timeout. Strict so a slow upstream soft-fails fast. */
    private const int HTTP_TIMEOUT_SECONDS = 3;

    public function __construct(private readonly HttpClientFactory $http)
    {
    }

    /**
     * Returns true when the password's SHA-1 hash appears in the
     * HaveIBeenPwned dataset. Returns false on a clean miss AND on
     * upstream failure (soft-fail per #415 brief — the user must
     * not be blocked from signing up if HIBP is down).
     */
    public function isPwned(string $password): bool
    {
        $sha1 = strtoupper(sha1($password));
        $prefix = substr($sha1, 0, 5);
        $suffix = substr($sha1, 5);

        $body = $this->fetchBucket($prefix);
        if ($body === null) {
            return false;
        }

        // Each line is `SUFFIX:COUNT\r\n`. We only care whether our
        // suffix is present — the count is meaningful only for the
        // SPA's "how popular is this leak" surface, which #415
        // explicitly does NOT ship.
        foreach (preg_split('/\r?\n/', $body) ?: [] as $line) {
            $parts = explode(':', $line, 2);
            if (\count($parts) === 2 && strtoupper($parts[0]) === $suffix) {
                return true;
            }
        }

        return false;
    }

    /**
     * Fetch a 5-char prefix bucket. Returns the raw response body on
     * success, null on transport / 5xx failure (soft-fail). The
     * cache key uses the prefix verbatim — no reversibility, matches
     * the privacy story of the k-anonymity API itself.
     */
    private function fetchBucket(string $prefix): ?string
    {
        $cacheKey = 'pwned-passwords:' . $prefix;

        /** @var string|null $cached */
        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $response = $this->http
                ->timeout(self::HTTP_TIMEOUT_SECONDS)
                ->withHeaders([
                    // Required by HIBP for bucket-padding (returns
                    // randomised extra entries to defeat traffic
                    // analysis on lone-suffix lookups).
                    'Add-Padding' => 'true',
                ])
                ->get(self::ENDPOINT . $prefix);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $body = $response->body();
        Cache::put($cacheKey, $body, self::CACHE_TTL_SECONDS);

        return $body;
    }
}
