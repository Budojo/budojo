<?php

declare(strict_types=1);

use App\Support\CorsAllowlist;

it('parses comma-separated origins, trims whitespace, and drops empty entries', function (): void {
    expect(CorsAllowlist::parse('https://a.example,  https://b.example  ,, https://c.example'))
        ->toBe(['https://a.example', 'https://b.example', 'https://c.example']);
});

it('returns the dev-server fallback when the env value is null', function (): void {
    expect(CorsAllowlist::parse(null))->toBe(['http://localhost:4200']);
});

it('returns an empty list when the env value is an explicit empty string (deliberate empty allowlist)', function (): void {
    expect(CorsAllowlist::parse(''))->toBe([]);
});

it('preserves a single origin without commas', function (): void {
    expect(CorsAllowlist::parse('https://only.example'))->toBe(['https://only.example']);
});

it('exposes the dev-server origin as a class constant', function (): void {
    expect(CorsAllowlist::DEFAULT_DEV_ORIGIN)->toBe('http://localhost:4200');
});
