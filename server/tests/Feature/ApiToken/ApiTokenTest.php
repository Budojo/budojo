<?php

declare(strict_types=1);

use App\Support\ApiTokenAbility;
use Laravel\Sanctum\PersonalAccessToken;

it('GET /me/api-tokens returns an empty list + the abilities catalog', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->getJson('/api/v1/me/api-tokens');
    $response->assertOk()
        ->assertJsonPath('data', [])
        ->assertJsonPath('meta.available_abilities', ApiTokenAbility::all());
});

it('POST /me/api-tokens mints a token + returns the plaintext ONCE', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->postJson('/api/v1/me/api-tokens', [
        'name' => 'nightly-export-script',
        'abilities' => [ApiTokenAbility::ATHLETES_READ, ApiTokenAbility::DOCUMENTS_READ],
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.name', 'nightly-export-script')
        ->assertJsonStructure(['data' => ['id', 'name', 'abilities', 'plain_text_token']]);
    expect($response->json('data.plain_text_token'))->toBeString();
    expect($response->json('data.abilities'))->toBe([
        ApiTokenAbility::ATHLETES_READ,
        ApiTokenAbility::DOCUMENTS_READ,
    ]);

    // Sanity check on the persisted row.
    $row = PersonalAccessToken::query()->find($response->json('data.id'));
    expect($row)->not->toBeNull();
    expect($row->kind)->toBe('api');
});

it('POST /me/api-tokens rejects an empty abilities list', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/me/api-tokens', [
            'name' => 'no-abilities',
            'abilities' => [],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['abilities']);
});

it('POST /me/api-tokens rejects an unknown ability key', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/me/api-tokens', [
            'name' => 'invalid-ability',
            'abilities' => ['athletes:nuke'],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['abilities.0']);
});

it('POST /me/api-tokens accepts an optional expires_in_days', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->postJson('/api/v1/me/api-tokens', [
        'name' => 'short-lived',
        'abilities' => [ApiTokenAbility::ATHLETES_READ],
        'expires_in_days' => 30,
    ]);
    $response->assertCreated();
    expect($response->json('data.expires_at'))->not->toBeNull();
});

it('DELETE /me/api-tokens/{id} revokes a token', function (): void {
    $user = userWithAcademy();
    $created = $this->actingAs($user)->postJson('/api/v1/me/api-tokens', [
        'name' => 'to-be-revoked',
        'abilities' => [ApiTokenAbility::ATHLETES_READ],
    ])->json('data');

    $this->actingAs($user)
        ->deleteJson("/api/v1/me/api-tokens/{$created['id']}")
        ->assertOk()
        ->assertJsonPath('data.revoked', true);

    expect(PersonalAccessToken::query()->find($created['id']))->toBeNull();
});

it("DELETE /me/api-tokens/{id} 404s on another user's token id", function (): void {
    $owner = userWithAcademy();
    $intruder = userWithAcademy();

    $created = $this->actingAs($owner)->postJson('/api/v1/me/api-tokens', [
        'name' => 'owner-only',
        'abilities' => [ApiTokenAbility::ATHLETES_READ],
    ])->json('data');

    $this->actingAs($intruder)
        ->deleteJson("/api/v1/me/api-tokens/{$created['id']}")
        ->assertNotFound();

    // The owner's token is intact.
    expect(PersonalAccessToken::query()->find($created['id']))->not->toBeNull();
});

it('GET /me/sessions does NOT include API tokens', function (): void {
    $user = userWithAcademy();

    // Mint an API token alongside any session tokens the actingAs
    // path might produce.
    $this->actingAs($user)->postJson('/api/v1/me/api-tokens', [
        'name' => 'integration-1',
        'abilities' => [ApiTokenAbility::ATHLETES_READ],
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/sessions');
    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name')->all();
    expect(in_array('integration-1', $names, true))->toBeFalse();
});

it('GET /me/api-tokens does NOT include legacy session tokens', function (): void {
    $user = userWithAcademy();

    // Simulate a legacy session token in the row alongside the
    // API token. createToken with default `kind = 'session'`.
    $user->createToken('legacy-session-on-iphone');
    $this->actingAs($user)->postJson('/api/v1/me/api-tokens', [
        'name' => 'integration-tool',
        'abilities' => [ApiTokenAbility::PAYMENTS_READ],
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/api-tokens');
    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name')->all();
    expect($names)->toContain('integration-tool');
    expect(in_array('legacy-session-on-iphone', $names, true))->toBeFalse();
});

it('all API token endpoints 401 without authentication', function (): void {
    $this->getJson('/api/v1/me/api-tokens')->assertUnauthorized();
    $this->postJson('/api/v1/me/api-tokens', ['name' => 'x', 'abilities' => []])->assertUnauthorized();
    $this->deleteJson('/api/v1/me/api-tokens/1')->assertUnauthorized();
});
