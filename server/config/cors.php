<?php

declare(strict_types=1);

use App\Support\CorsAllowlist;

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Allowed origins are read from the `CORS_ALLOWED_ORIGINS` env variable as
    | a comma-separated list. Local dev defaults to the Angular dev server.
    | Production sets the prod SPA origins via Forge environment. The CSV
    | parsing pipeline (split, trim, drop empty) lives in `CorsAllowlist` so
    | it can be unit-tested without round-tripping through Laravel's Env
    | repository (which is immutable after boot).
    |
    | We use Bearer-token auth (no cookies, see server/CLAUDE.md § API
    | conventions), so `supports_credentials` stays false.
    |
    */

    'paths' => ['api/*'],

    // Enumerate the verbs the SPA actually uses (#1015) instead of
    // `['*']`. Wildcard worked but reads as "we did not think about
    // CORS"; the explicit list documents the surface and rejects a
    // future verb that we did not intend to expose without a
    // deliberate config change.
    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],

    'allowed_origins' => CorsAllowlist::parse(env('CORS_ALLOWED_ORIGINS')),

    'allowed_origins_patterns' => [],

    // Enumerate the headers the SPA actually sends (#1015) instead
    // of `['*']`. Same documentation argument as `allowed_methods`
    // above; tighter surface, deliberate evolution. `X-Requested-With`
    // covers Angular's default ajax marker; `X-Budojo-Version` is
    // the SPA's build-stamp echo back to the API; the rest are
    // standard browser/auth headers.
    'allowed_headers' => [
        'Accept',
        'Accept-Language',
        'Authorization',
        'Content-Type',
        'X-Requested-With',
        'X-Budojo-Version',
    ],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
