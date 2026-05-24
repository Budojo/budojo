<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Defense-in-depth security headers on every response (#1017).
 *
 * The production nginx vhost (Forge) MAY set these at the edge — but
 * we don't currently document that, and dev / staging / a future
 * containerised deploy might not. Applying the same headers in the
 * application layer guarantees they ship regardless of the upstream
 * proxy config; the duplication (when nginx also sets them) is
 * harmless because each header is a single value the browser
 * applies idempotently.
 *
 * **Why each header**:
 *
 * - `Strict-Transport-Security` (HSTS) — pins HTTPS for 1 year on
 *   the API origin. `includeSubDomains` extends to anything served
 *   off the same registrable domain. No `preload` flag: we don't
 *   want to commit to the HSTS preload list from the API surface;
 *   that's a separate, explicit deploy decision.
 * - `X-Frame-Options: DENY` — defense against clickjacking by
 *   embedding the JSON-API surface in an `<iframe>`. The API never
 *   renders HTML the user interacts with, so `DENY` is strictly
 *   stronger than `SAMEORIGIN`.
 * - `X-Content-Type-Options: nosniff` — disables MIME sniffing on
 *   downloads from `/me/export` / `/athletes/{id}/documents/*`.
 * - `Referrer-Policy: no-referrer` — the API surface never needs
 *   the user's previous URL leaked outward; the SPA controls
 *   referrer for its own navigation.
 * - `Content-Security-Policy` — restrictive default for a pure
 *   JSON API: no scripts, no embedded media, no plugins. The
 *   header is a no-op on JSON responses but guards against an
 *   accidental HTML render path (the 500 error shell would
 *   otherwise execute inline `<script>`).
 */
class SecurityHeaders
{
    public function handle(Request $request, \Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        // `default-src 'none'` covers only the FETCH directives
        // (script-src, img-src, etc.). Per CSP3 § 6.1 the NAVIGATION
        // directives — `form-action` and `base-uri` — do NOT inherit;
        // we add them explicitly to complete the "most restrictive
        // possible" posture (#1018 reviewer). `form-action 'none'`
        // blocks `<form action="…">` submissions on an accidental
        // HTML render; `base-uri 'none'` blocks `<base href>`
        // injection that would otherwise rebase relative URLs.
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
        );

        return $response;
    }
}
