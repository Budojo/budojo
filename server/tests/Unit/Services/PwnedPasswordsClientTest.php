<?php

declare(strict_types=1);

use App\Services\PwnedPasswordsClient;
use Illuminate\Http\Client\Factory as HttpClientFactory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    Cache::flush();
});

function pwnedClient(): PwnedPasswordsClient
{
    return new PwnedPasswordsClient(app(HttpClientFactory::class));
}

it('returns true when the SHA-1 suffix appears in the bucket', function (): void {
    // SHA-1 of "password" = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // Prefix: 5BAA6, Suffix: 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    Http::fake([
        'api.pwnedpasswords.com/range/5BAA6' => Http::response(
            "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" .
            '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824' . "\r\n" .
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0',
            200,
        ),
    ]);

    expect(pwnedClient()->isPwned('password'))->toBeTrue();
});

it('returns false when the SHA-1 suffix is not in the bucket', function (): void {
    Http::fake([
        'api.pwnedpasswords.com/range/*' => Http::response(
            "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" .
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1',
            200,
        ),
    ]);

    expect(pwnedClient()->isPwned('something-not-in-the-fake-bucket'))->toBeFalse();
});

it('soft-fails (returns false) on upstream 5xx', function (): void {
    Http::fake([
        'api.pwnedpasswords.com/range/*' => Http::response('', 503),
    ]);

    // Soft-fail: API down → user proceeds with the password. The brief
    // explicitly calls this out — we don't outage signup over a third-
    // party hiccup.
    expect(pwnedClient()->isPwned('any-password'))->toBeFalse();
});

it('soft-fails (returns false) on transport-level exception', function (): void {
    Http::fake(function () {
        throw new \Illuminate\Http\Client\ConnectionException('Connection timed out.');
    });

    expect(pwnedClient()->isPwned('any-password'))->toBeFalse();
});

it('caches the bucket response so a second lookup with the same prefix does not re-fetch', function (): void {
    Http::fake([
        'api.pwnedpasswords.com/range/5BAA6' => Http::response(
            '1E4C9B93F3F0682250B6CF8331B7EE68FD8:1',
            200,
        ),
    ]);

    pwnedClient()->isPwned('password');
    pwnedClient()->isPwned('password');

    Http::assertSentCount(1);
});

it('sends the Add-Padding header for traffic-analysis defence', function (): void {
    Http::fake([
        'api.pwnedpasswords.com/range/*' => Http::response('', 200),
    ]);

    pwnedClient()->isPwned('whatever');

    Http::assertSent(fn ($request) => $request->hasHeader('Add-Padding', 'true'));
});

it('only sends the 5-char SHA-1 prefix, never the password', function (): void {
    Http::fake([
        'api.pwnedpasswords.com/range/*' => Http::response('', 200),
    ]);

    pwnedClient()->isPwned('correct horse battery staple');

    Http::assertSent(function ($request) {
        $url = (string) $request->url();

        // The endpoint path ends in a 5-char hex prefix.
        return preg_match('#/range/[A-F0-9]{5}$#', $url) === 1
            // Defence in depth — assert the password / its full SHA-1
            // never makes it onto the wire.
            && ! str_contains($url, 'correct')
            && ! str_contains($url, sha1('correct horse battery staple'));
    });
});

it('uppercases the SHA-1 prefix before fetching (HIBP returns uppercase)', function (): void {
    // SHA-1 of "" (empty string) → DA39A3EE5E6B4B0D3255BFEF95601890AFD80709
    // We never hash empty in production but the case-folding logic is
    // worth pinning regardless.
    Http::fake([
        'api.pwnedpasswords.com/range/*' => Http::response('', 200),
    ]);

    pwnedClient()->isPwned('Test');

    Http::assertSent(function ($request) {
        $url = (string) $request->url();

        return preg_match('#/range/[A-F0-9]{5}$#', $url) === 1;
    });
});
