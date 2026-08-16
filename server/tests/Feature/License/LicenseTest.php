<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Models\Athlete;
use App\Models\License;
use App\Models\User;
use App\Rules\ValidLicenseKey;
use App\Support\ApiTokenAbility;
use Illuminate\Support\Facades\Hash;

/**
 * Licence status, activation and enforcement end to end (#1290).
 *
 * The keypair is generated per test and its public half pushed into config, so
 * these exercise the real signature path — nothing here is stubbed. The private
 * half exists only inside the test process; the real one lives in a password
 * manager and has never been near this repository.
 */
function licensingEncode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

/** Trust a fresh keypair for the duration of one test; return its private half. */
function licensingKeypair(): string
{
    $pair = sodium_crypto_sign_keypair();

    config()->set('budojo.license.public_key', licensingEncode(sodium_crypto_sign_publickey($pair)));

    return sodium_crypto_sign_secretkey($pair);
}

function licensingKey(string $secret, ?string $expires, string $name = 'Budojo Roma'): string
{
    $claims = ['v' => 1, 'name' => $name, 'issued' => '2026-01-01'];

    if ($expires !== null) {
        $claims['expires'] = $expires;
    }

    $payload = json_encode($claims, JSON_THROW_ON_ERROR);

    return 'BUDOJO-1-' . licensingEncode($payload)
        . '.' . licensingEncode(sodium_crypto_sign_detached($payload, $secret));
}

/**
 * The smallest athlete the API accepts — the canonical "is this instance
 * usable?" write these tests probe with.
 *
 * @return array<string, string>
 */
function athletePayload(): array
{
    return [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => 'white',
        'status' => 'active',
        'joined_at' => '2026-01-15',
    ];
}

/** A desktop instance whose free fortnight ran out a week ago. */
function lapsedDesktopOwner(): User
{
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();
    test()->travel(21)->days();

    return $owner;
}

// ── Status ───────────────────────────────────────────────────────────────────

it('does not offer a licence surface on the web profile', function (): void {
    config()->set('budojo.runtime', 'web');
    $owner = userWithAcademy();

    $this->actingAs($owner)->getJson('/api/v1/license')->assertNotFound();
    $this->actingAs($owner)->postJson('/api/v1/license', ['key' => 'x'])->assertNotFound();
});

it('reports the trial and its countdown on a fresh desktop instance', function (): void {
    licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)->getJson('/api/v1/license')
        ->assertOk()
        ->assertJsonPath('data.status', 'trial')
        ->assertJsonPath('data.days_remaining', 14)
        ->assertJsonPath('data.licensee', null);
});

it('counts the trial down from the account, not from the request', function (): void {
    licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();
    $this->travel(10)->days();

    $this->actingAs($owner)->getJson('/api/v1/license')
        ->assertOk()
        ->assertJsonPath('data.status', 'trial')
        ->assertJsonPath('data.days_remaining', 4);
});

// ── Activation ───────────────────────────────────────────────────────────────

it('activates a genuine key and keeps it activated', function (): void {
    $secret = licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)
        ->postJson('/api/v1/license', ['key' => licensingKey($secret, '2027-08-16')])
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.licensee', 'Budojo Roma')
        ->assertJsonPath('data.expires_at', '2027-08-16');

    // Read back through a separate request: the state is stored, not remembered.
    $this->actingAs($owner)->getJson('/api/v1/license')
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.licensee', 'Budojo Roma');
});

it('refuses a key signed by anyone else', function (): void {
    licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    // Genuine shape, genuine signature — from a keypair we do not trust.
    $forged = licensingKey(sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair()), '2027-08-16');

    $this->actingAs($owner)->postJson('/api/v1/license', ['key' => $forged])
        ->assertStatus(422)
        ->assertJsonPath('errors.key.0', ValidLicenseKey::FAILURE_CODE);

    expect(License::query()->count())->toBe(0);
});

it('refuses a key that has already run out, rather than storing a dead one', function (): void {
    $secret = licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)
        ->postJson('/api/v1/license', ['key' => licensingKey($secret, '2020-01-01')])
        ->assertStatus(422)
        ->assertJsonPath('errors.key.0', ValidLicenseKey::EXPIRED_CODE);
});

it('lets a renewal supersede the key it replaces', function (): void {
    $secret = licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)->postJson('/api/v1/license', ['key' => licensingKey($secret, '2026-12-31')])
        ->assertOk()
        ->assertJsonPath('data.expires_at', '2026-12-31');

    $this->travel(1)->seconds();

    $this->actingAs($owner)->postJson('/api/v1/license', ['key' => licensingKey($secret, '2027-12-31')])
        ->assertOk()
        ->assertJsonPath('data.expires_at', '2027-12-31');

    // Both activations are on record; the most recent one is the one in force.
    expect(License::query()->count())->toBe(2);
    $this->actingAs($owner)->getJson('/api/v1/license')->assertJsonPath('data.expires_at', '2027-12-31');
});

it('only lets the owner activate', function (): void {
    licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $athlete = User::factory()->create(['role' => UserRole::Athlete]);

    $this->actingAs($athlete)->postJson('/api/v1/license', ['key' => 'anything'])
        ->assertForbidden()
        ->assertJsonPath('message', 'role_required');
});

// ── Enforcement ──────────────────────────────────────────────────────────────

it('refuses writes once the trial has run out', function (): void {
    licensingKeypair();
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->postJson('/api/v1/athletes', [])
        ->assertStatus(402)
        ->assertJsonPath('message', 'license_required');
});

it('gates the write before it is even validated', function (): void {
    // The 402 above could have been a 422 in disguise. A well-formed payload
    // pins that the refusal is the licence, not the body.
    licensingKeypair();
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload())->assertStatus(402);
});

it('never stops the owner reading their own records', function (): void {
    licensingKeypair();
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->getJson('/api/v1/athletes')->assertOk();
    $this->actingAs($owner)->getJson('/api/v1/academy')->assertOk();
});

it('keeps the way back in open when everything else is shut', function (): void {
    $secret = licensingKeypair();
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->getJson('/api/v1/license')
        ->assertOk()
        ->assertJsonPath('data.status', 'expired')
        ->assertJsonPath('data.days_remaining', 0);

    $this->actingAs($owner)->postJson('/api/v1/license', ['key' => licensingKey($secret, '2027-08-16')])
        ->assertOk()
        ->assertJsonPath('data.status', 'active');

    // ...and the instance is working again immediately.
    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload())->assertCreated();
});

it('lets a credential be revoked while blocked, but not minted', function (): void {
    // Killing a leaked token is a security action; issuing a new one is using
    // the product. The URL shape is what separates them in the exempt list, so
    // this pins that the split actually works.
    licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    // Minted while the trial was still running...
    $id = $this->actingAs($owner)->postJson('/api/v1/me/api-tokens', [
        'name' => 'integration',
        'abilities' => [ApiTokenAbility::PAYMENTS_READ],
    ])->assertCreated()->json('data.id');

    $this->travel(21)->days();

    // ...and still revocable after the licence lapsed.
    $this->actingAs($owner)->deleteJson('/api/v1/me/api-tokens/' . $id)->assertSuccessful();

    $this->actingAs($owner)->postJson('/api/v1/me/api-tokens', [
        'name' => 'another',
        'abilities' => [ApiTokenAbility::PAYMENTS_READ],
    ])->assertStatus(402);
});

it('still lets the owner log in after the trial has run out', function (): void {
    // The single exemption standing between a lapsed instance and a permanent
    // lockout: activation lives behind auth:sanctum, so an owner who signs out
    // and cannot sign back in can never reach it — and a desktop customer has
    // no console to rescue themselves with. Every other test here uses
    // actingAs(), which bypasses this route entirely.
    $secret = licensingKeypair();
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();
    $owner->forceFill(['password' => Hash::make('a-real-passphrase-42')])->save();
    $this->travel(21)->days();

    $token = $this->postJson('/api/v1/auth/login', [
        'email' => $owner->email,
        'password' => 'a-real-passphrase-42',
    ])->assertSuccessful()->json('token');

    expect($token)->toBeString();

    // ...and from that fresh session, activation works.
    $this->withToken($token)
        ->postJson('/api/v1/license', ['key' => licensingKey($secret, '2027-08-16')])
        ->assertOk()
        ->assertJsonPath('data.status', 'active');
});

it('lets an absent capability answer 404 rather than asking for money', function (): void {
    // Two gates disagree if this is wrong: `capability:` says a surface this
    // runtime does not have must not advertise itself, and group middleware
    // runs first. A 402 here would tell a prober that a route the desktop does
    // not even serve exists and is merely unpaid.
    licensingKeypair();
    $owner = lapsedDesktopOwner();
    $athlete = Athlete::factory()->for($owner->academy)->create(['email' => 'a@example.test']);

    $this->actingAs($owner)->postJson("/api/v1/athletes/{$athlete->id}/invite")->assertNotFound();
});

it('keeps support reachable while blocked', function (): void {
    // Not the product; the way someone stuck reaches a human.
    licensingKeypair();
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->postJson('/api/v1/support', [
        'subject' => 'Licence key',
        'category' => 'billing',
        'body' => 'My key does not work and I cannot add anyone.',
    ])->assertSuccessful();
});

it('leaves the web profile alone however old the account is', function (): void {
    licensingKeypair();
    config()->set('budojo.runtime', 'web');
    $owner = userWithAcademy();
    $this->travel(400)->days();

    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload())->assertCreated();
});

it('enforces nothing when the build carries no public key', function (): void {
    // A build shipped without the key cannot verify anything, so it must not
    // pretend to: locking every customer out over a missing build variable is
    // the one failure mode worse than not charging them.
    config()->set('budojo.license.public_key', '');
    $owner = lapsedDesktopOwner();

    $this->actingAs($owner)->getJson('/api/v1/license')
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.days_remaining', null);

    $this->actingAs($owner)->postJson('/api/v1/athletes', athletePayload())->assertCreated();
});
