<?php

declare(strict_types=1);

/*
 * NOTE on the 2-origin allowlist used in these tests:
 * Laravel's CORS layer (asm89/stack-cors) takes a "single allowed origin"
 * shortcut: when allowed_origins has exactly one entry and no patterns, the
 * middleware emits Access-Control-Allow-Origin equal to that one origin on
 * EVERY response, regardless of the request Origin. The browser still
 * blocks mismatched origins, but the server-side allowlist behavior is
 * untestable in that branch. With 2+ origins the middleware falls into the
 * proper allowlist check, which is what we exercise here.
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
