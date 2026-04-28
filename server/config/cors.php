<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Allowed origins are read from the `CORS_ALLOWED_ORIGINS` env variable as
    | a comma-separated list. Local dev defaults to the Angular dev server.
    | Production sets the prod SPA origins via Forge environment.
    |
    | We use Bearer-token auth (no cookies, see server/CLAUDE.md § API
    | conventions), so `supports_credentials` stays false.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:4200'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
