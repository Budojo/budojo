<?php

declare(strict_types=1);

use App\Enums\Capability;
use App\Support\Capabilities;

/**
 * The capability set per runtime profile (#1229). Web has everything; the
 * desktop — one process, one machine, no mail transport, no push service —
 * has none of the surfaces that assume a second human, an inbox or a push
 * endpoint. The code behind each stays in place; flipping the profile
 * restores it.
 */
it('gives the web profile every capability', function (): void {
    config()->set('budojo.runtime', 'web');

    expect(Capabilities::all())->toEqualCanonicalizing(Capability::cases());
});

it('gives the desktop profile none of the multi-user capabilities', function (): void {
    config()->set('budojo.runtime', 'desktop');

    expect(Capabilities::all())->toBe([])
        ->and(Capabilities::has(Capability::Community))->toBeFalse()
        ->and(Capabilities::has(Capability::AthleteAccounts))->toBeFalse()
        ->and(Capabilities::has(Capability::WebPush))->toBeFalse()
        ->and(Capabilities::has(Capability::Email))->toBeFalse()
        ->and(Capabilities::has(Capability::PasswordBreachCheck))->toBeFalse();
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
        ->assertJsonCount(count(Capability::cases()), 'data.capabilities')
        ->assertJsonFragment(['community']);
});

it('reports an empty capability list on the desktop endpoint', function (): void {
    config()->set('budojo.runtime', 'desktop');

    $this->getJson('/api/v1/runtime')
        ->assertOk()
        ->assertExactJson(['data' => ['profile' => 'desktop', 'capabilities' => []]]);
});
