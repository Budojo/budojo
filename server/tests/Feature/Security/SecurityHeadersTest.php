<?php

declare(strict_types=1);

it('sets HSTS / X-Frame / X-Content-Type / Referrer / CSP on every response (#1017)', function (): void {
    $response = $this->get('/api/v1/health');

    $response->assertOk();
    expect($response->headers->get('Strict-Transport-Security'))
        ->toBe('max-age=31536000; includeSubDomains');
    expect($response->headers->get('X-Frame-Options'))->toBe('DENY');
    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');
    expect($response->headers->get('Referrer-Policy'))->toBe('no-referrer');
    expect($response->headers->get('Content-Security-Policy'))
        ->toBe("default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
});

it('sets the same headers on authenticated routes', function (): void {
    $user = \App\Models\User::factory()->create();
    $response = $this->actingAs($user)->get('/api/v1/auth/me');

    expect($response->headers->get('X-Frame-Options'))->toBe('DENY');
    expect($response->headers->get('Content-Security-Policy'))
        ->toBe("default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
});

it('sets the same headers on a 4xx response (defense-in-depth)', function (): void {
    // 401 path — unauthenticated request to a protected endpoint.
    $response = $this->getJson('/api/v1/auth/me');

    $response->assertUnauthorized();
    expect($response->headers->get('X-Frame-Options'))->toBe('DENY');
    expect($response->headers->get('Strict-Transport-Security'))
        ->toBe('max-age=31536000; includeSubDomains');
});
