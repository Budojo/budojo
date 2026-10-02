<?php

declare(strict_types=1);

use App\Enums\Capability;
use App\Support\Capabilities;

/**
 * The capability set per runtime profile (#1229). Web has every multi-user
 * capability; the desktop — one process, one machine, no mail transport, no
 * push service — has none of the surfaces that assume a second human, an inbox
 * or a push endpoint. The code behind each stays in place; flipping the profile
 * restores it.
 *
 * The one capability the other way round is the sync between the owner's own
 * devices (#2030): a device has a database to hand over, the hosted web never
 * did.
 */
it('gives the web profile every multi-user capability, and not the device sync', function (): void {
    config()->set('budojo.runtime', 'web');

    expect(Capabilities::all())->toEqualCanonicalizing(
        array_values(array_filter(Capability::cases(), fn (Capability $capability) => $capability !== Capability::Sync)),
    )->and(Capabilities::has(Capability::Sync))->toBeFalse();
});

it('gives the desktop profile the sync, and none of the multi-user capabilities', function (): void {
    config()->set('budojo.runtime', 'desktop');

    expect(Capabilities::all())->toBe([Capability::Sync])
        ->and(Capabilities::has(Capability::Community))->toBeFalse()
        ->and(Capabilities::has(Capability::AthleteAccounts))->toBeFalse()
        ->and(Capabilities::has(Capability::WebPush))->toBeFalse()
        ->and(Capabilities::has(Capability::Email))->toBeFalse()
        ->and(Capabilities::has(Capability::PasswordBreachCheck))->toBeFalse();
});

it('gives the phone the sync, and none of the multi-user capabilities (#2034)', function (): void {
    config()->set('budojo.runtime', 'mobile');

    expect(Capabilities::all())->toBe([Capability::Sync]);
});

it('ignores unknown names in the config map rather than crashing boot', function (): void {
    // A typo in config must degrade to "that capability is absent", never to
    // a 500 on every request.
    config()->set('budojo.runtime', 'web');
    config()->set('budojo.capabilities.web', ['community', 'not_a_real_capability']);

    expect(Capabilities::all())->toBe([Capability::Community]);
});

it('exposes the profile and its capabilities on a public endpoint', function (): void {
    // Public on purpose: the SPA reads it before login because the register
    // and landing pages already differ by runtime.
    config()->set('budojo.runtime', 'web');

    $this->getJson('/api/v1/runtime')
        ->assertOk()
        ->assertJsonPath('data.profile', 'web')
        ->assertJsonCount(count(Capability::cases()) - 1, 'data.capabilities')
        ->assertJsonFragment(['community']);
});

it('reports only the sync on the desktop endpoint', function (): void {
    config()->set('budojo.runtime', 'desktop');

    $this->getJson('/api/v1/runtime')
        ->assertOk()
        ->assertExactJson(['data' => ['profile' => 'desktop', 'capabilities' => ['sync']]]);
});
