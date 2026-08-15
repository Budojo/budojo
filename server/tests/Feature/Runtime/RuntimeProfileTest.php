<?php

declare(strict_types=1);

use App\Enums\RuntimeProfile;
use App\Support\Runtime;

/**
 * The runtime profile (#1220) is how the codebase learns whether it is
 * serving the hosted SPA or running inside the Electron desktop shell
 * (#1218). Everything downstream — hidden multi-user surfaces, the
 * notification transport, which drivers are legal — keys off this single
 * value rather than sniffing env strings at each call site.
 */
it('defaults to the web profile', function (): void {
    config()->set('budojo.runtime', 'web');

    expect(Runtime::profile())->toBe(RuntimeProfile::Web)
        ->and(Runtime::isWeb())->toBeTrue()
        ->and(Runtime::isDesktop())->toBeFalse();
});

it('reports the desktop profile when configured', function (): void {
    config()->set('budojo.runtime', 'desktop');

    expect(Runtime::profile())->toBe(RuntimeProfile::Desktop)
        ->and(Runtime::isDesktop())->toBeTrue()
        ->and(Runtime::isWeb())->toBeFalse();
});

it('falls back to web when the configured profile is unknown', function (): void {
    // A typo in an env file must not silently unlock desktop-only behaviour.
    // Web is the conservative default: it hides nothing and assumes nothing
    // about the host.
    config()->set('budojo.runtime', 'destkop');

    expect(Runtime::profile())->toBe(RuntimeProfile::Web);
});

it('treats a missing profile as web', function (): void {
    config()->set('budojo.runtime', null);

    expect(Runtime::profile())->toBe(RuntimeProfile::Web);
});
