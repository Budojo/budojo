<?php

declare(strict_types=1);

/*
 * NOTE on the 2-origin allowlist used in these tests:
 * Laravel's CORS layer (fruitcake/php-cors, the package laravel/framework
 * pulls in) takes a "single allowed origin" shortcut: when allowed_origins
 * has exactly one entry and no patterns, the middleware emits
 * Access-Control-Allow-Origin equal to that one origin on EVERY response,
 * regardless of the request Origin. The browser still blocks mismatched
 * origins, but the server-side allowlist behavior is untestable in that
 * branch. With 2+ origins the middleware falls into the proper allowlist
 * check, which is what the matched/unmatched/multiple-origin cases below
 * exercise.
 */

it('echoes the Origin in CORS headers when it matches the allowlist', function (): void {
    config(['cors.allowed_origins' => ['https://budojo.it', 'https://www.budojo.it']]);

    $this->withHeader('Origin', 'https://budojo.it')
        ->getJson('/api/v1/health')
        ->assertOk()
        ->assertHeader('Access-Control-Allow-Origin', 'https://budojo.it');
});

it('omits the CORS headers when the request Origin is not in the allowlist', function (): void {
    config(['cors.allowed_origins' => ['https://budojo.it', 'https://www.budojo.it']]);

    $response = $this->withHeader('Origin', 'https://evil.example')
        ->getJson('/api/v1/health');

    $response->assertOk();
    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull();
});

it('respects multiple allowed origins on the allowlist', function (): void {
    config(['cors.allowed_origins' => ['https://budojo.it', 'https://www.budojo.it']]);

    $this->withHeader('Origin', 'https://www.budojo.it')
        ->getJson('/api/v1/health')
        ->assertOk()
        ->assertHeader('Access-Control-Allow-Origin', 'https://www.budojo.it');
});

/*
 * The two tests below exercise the env-driven parsing pipeline in
 * config/cors.php (comma split, trim, empty-entry filter, default fallback).
 * They re-evaluate the file with `include` so the actual env() call is hit,
 * not just config()->set() which bypasses the file. We toggle $_ENV +
 * putenv() together to cover whichever env adapter Laravel's repository is
 * built with (immutable / putenv).
 */

it('parses CORS_ALLOWED_ORIGINS env as comma-separated, trimmed, with empty entries filtered', function (): void {
    $previous = getenv('CORS_ALLOWED_ORIGINS');

    $value = 'https://a.example,  https://b.example  ,, https://c.example';
    $_ENV['CORS_ALLOWED_ORIGINS'] = $value;
    putenv("CORS_ALLOWED_ORIGINS={$value}");

    try {
        $config = include config_path('cors.php');

        expect($config['allowed_origins'])->toBe([
            'https://a.example',
            'https://b.example',
            'https://c.example',
        ]);
    } finally {
        unset($_ENV['CORS_ALLOWED_ORIGINS']);
        $previous === false ? putenv('CORS_ALLOWED_ORIGINS') : putenv("CORS_ALLOWED_ORIGINS={$previous}");
        if ($previous !== false) {
            $_ENV['CORS_ALLOWED_ORIGINS'] = $previous;
        }
    }
});

it('defaults to http://localhost:4200 when CORS_ALLOWED_ORIGINS env is unset', function (): void {
    $previous = getenv('CORS_ALLOWED_ORIGINS');

    unset($_ENV['CORS_ALLOWED_ORIGINS']);
    putenv('CORS_ALLOWED_ORIGINS');

    try {
        $config = include config_path('cors.php');

        expect($config['allowed_origins'])->toBe(['http://localhost:4200']);
    } finally {
        if ($previous !== false) {
            $_ENV['CORS_ALLOWED_ORIGINS'] = $previous;
            putenv("CORS_ALLOWED_ORIGINS={$previous}");
        }
    }
});
