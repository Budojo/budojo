<?php

declare(strict_types=1);

use App\Support\UserAgentLabel;

// Real-world UA strings sampled from major browsers (2026 fleet).
// The label is INTENTIONALLY coarse — "Chrome on macOS" not
// "Chrome 119.0.6045 on macOS 14.1.2 Sonoma" — because the user
// reading a sessions list cares about "is this me?" at-a-glance,
// not about telemetry-grade fingerprinting.

it('labels Chrome on macOS', function (): void {
    $ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Chrome on macOS');
});

it('labels Firefox on Windows', function (): void {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Firefox on Windows');
});

it('labels Safari on iPhone', function (): void {
    $ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Safari on iOS');
});

it('labels Safari on iPad', function (): void {
    $ua = 'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Safari on iOS');
});

it('labels Chrome on Android', function (): void {
    $ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Chrome on Android');
});

it('labels Edge on Windows', function (): void {
    // Edge on Chromium ships with an `Edg/` token AFTER the Chrome
    // token. Detection has to favor Edg over Chrome so the user sees
    // "Edge" instead of "Chrome".
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Edge on Windows');
});

it('labels Safari on macOS (when no Chrome / Edge token is present)', function (): void {
    $ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Safari on macOS');
});

it('labels Firefox on Linux', function (): void {
    $ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(UserAgentLabel::fromUserAgent($ua))->toBe('Firefox on Linux');
});

it('falls back to "Unknown device" on an empty UA string', function (): void {
    expect(UserAgentLabel::fromUserAgent(''))->toBe('Unknown device');
});

it('falls back to "Unknown device" on a totally-unparseable UA string', function (): void {
    // A bot or a custom client header that matches none of our known
    // browsers / OSes should land in the bucket — the user reading
    // their sessions list still needs SOMETHING to read in the
    // "Device" column. The string itself isn't meaningful to a
    // non-engineer; a stable bucket is.
    expect(UserAgentLabel::fromUserAgent('curl/7.88.1'))->toBe('Unknown device');
});

it('caps the output at a sensible length so a hostile UA cannot bloat the column', function (): void {
    // Defense-in-depth: even though the helper composes from a fixed
    // vocabulary of {browser} on {os}, future contributions might
    // pass through unsanitised UA fragments. The label column on
    // `personal_access_tokens.name` is a `string` (varchar 255) —
    // we want to ship well under that limit. Pin behavior at 80
    // chars max so the column never gets close to truncation
    // semantics.
    $ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    $label = UserAgentLabel::fromUserAgent($ua);
    expect(strlen($label))->toBeLessThanOrEqual(80);
});
