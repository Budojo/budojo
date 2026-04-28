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

    'allowed_methods' => ['*'],

    'allowed_origins' => CorsAllowlist::parse(env('CORS_ALLOWED_ORIGINS')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
