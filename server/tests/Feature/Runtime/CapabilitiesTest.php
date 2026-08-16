<?php

declare(strict_types=1);

use App\Enums\Capability;
use App\Support\Capabilities;

/**
 * The capability set per runtime profile (#1229). The desktop — one process,
 * one machine, no mail transport, no push service — has none of the surfaces
 * that assume a second human, an inbox or a push endpoint. The code behind each
 * stays in place; flipping the profile restores it.
 *
 * Capabilities are NOT a web superset with bits knocked out, and `licensing`
 * (#1290) is the case that proves it: activation keys apply to the machine on
 * someone's desk, never to a deployment whose operator is the one paying for
 * the server. Anything asserting "web has everything" would be asserting an
 * accident of the first five cases.
 */

/** @return list<Capability> */
function webCapabilities(): array
{
    return array_values(array_filter(
        Capability::cases(),
        static fn (Capability $capability): bool => $capability !== Capability::Licensing,
    ));
}

it('gives the web profile everything except the desktop-only surfaces', function (): void {
    config()->set('budojo.runtime', 'web');

    expect(Capabilities::all())->toEqualCanonicalizing(webCapabilities())
        ->and(Capabilities::has(Capability::Licensing))->toBeFalse();
});

it('gives the desktop profile none of the multi-user capabilities', function (): void {
    config()->set('budojo.runtime', 'desktop');

    expect(Capabilities::has(Capability::Community))->toBeFalse()
        ->and(Capabilities::has(Capability::AthleteAccounts))->toBeFalse()
        ->and(Capabilities::has(Capability::WebPush))->toBeFalse()
        ->and(Capabilities::has(Capability::Email))->toBeFalse()
        ->and(Capabilities::has(Capability::PasswordBreachCheck))->toBeFalse();
});

it('gives the desktop profile licensing, and only licensing', function (): void {
    config()->set('budojo.runtime', 'desktop');

    expect(Capabilities::all())->toBe([Capability::Licensing]);
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
        ->assertJsonCount(count(webCapabilities()), 'data.capabilities')
        ->assertJsonFragment(['community']);
});

it('reports the licensing capability on the desktop endpoint', function (): void {
    config()->set('budojo.runtime', 'desktop');

    $this->getJson('/api/v1/runtime')
        ->assertOk()
        ->assertExactJson(['data' => ['profile' => 'desktop', 'capabilities' => ['licensing']]]);
});
