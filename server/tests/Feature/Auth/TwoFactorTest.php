<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\TwoFactorAuth;
use Illuminate\Support\Facades\Hash;
use PragmaRX\Google2FA\Google2FA;

// ─── Enrolment + confirmation ─────────────────────────────────────────────────

it('POST /me/two-factor/enrol mints a secret and returns the provisioning URI', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->postJson('/api/v1/me/two-factor/enrol');

    $response->assertOk()
        ->assertJsonStructure(['data' => ['secret', 'provisioning_uri']]);

    $user->refresh();
    expect($user->two_factor_secret)->not->toBeNull();
    expect(strlen($user->two_factor_secret))->toBe(32);
    expect($user->two_factor_confirmed_at)->toBeNull();
});

it('POST /me/two-factor/enrol refuses to overwrite an already-active 2FA setup', function (): void {
    $user = userWithAcademy();
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_confirmed_at' => now(),
    ])->save();

    $this->actingAs($user)
        ->postJson('/api/v1/me/two-factor/enrol')
        ->assertUnprocessable();
});

it('POST /me/two-factor/confirm activates 2FA and returns 8 recovery codes', function (): void {
    $user = userWithAcademy();
    $secret = TwoFactorAuth::generateSecret();
    $user->forceFill(['two_factor_secret' => $secret])->save();

    $code = new Google2FA()->getCurrentOtp($secret);

    $response = $this->actingAs($user)->postJson('/api/v1/me/two-factor/confirm', [
        'code' => $code,
    ]);

    $response->assertOk()
        ->assertJsonStructure(['data' => ['recovery_codes']]);
    expect(count($response->json('data.recovery_codes')))->toBe(8);

    $user->refresh();
    expect($user->two_factor_confirmed_at)->not->toBeNull();
});

it('POST /me/two-factor/confirm rejects an invalid TOTP code', function (): void {
    $user = userWithAcademy();
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
    ])->save();

    $this->actingAs($user)
        ->postJson('/api/v1/me/two-factor/confirm', ['code' => '000000'])
        ->assertUnprocessable();

    $user->refresh();
    expect($user->two_factor_confirmed_at)->toBeNull();
});

it('POST /me/two-factor/recovery-codes/regenerate replaces the codes', function (): void {
    $user = userWithAcademy();
    $original = ['AAAA-BBBB', 'CCCC-DDDD'];
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_recovery_codes' => $original,
        'two_factor_confirmed_at' => now(),
    ])->save();

    $response = $this->actingAs($user)
        ->postJson('/api/v1/me/two-factor/recovery-codes/regenerate');

    $response->assertOk();
    $newCodes = $response->json('data.recovery_codes');
    expect(count($newCodes))->toBe(8);
    expect($newCodes)->not->toBe($original);

    $user->refresh();
    expect($user->two_factor_recovery_codes)->toBe($newCodes);
});

it('DELETE /me/two-factor wipes the columns when the password is correct', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('correct-horse')]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_recovery_codes' => TwoFactorAuth::generateRecoveryCodes(),
        'two_factor_confirmed_at' => now(),
    ])->save();

    $response = $this->actingAs($user)->deleteJson('/api/v1/me/two-factor', [
        'password' => 'correct-horse',
    ]);

    $response->assertOk()->assertJsonPath('data.disabled', true);

    $user->refresh();
    expect($user->two_factor_secret)->toBeNull();
    expect($user->two_factor_recovery_codes)->toBeNull();
    expect($user->two_factor_confirmed_at)->toBeNull();
});

it('DELETE /me/two-factor refuses when the password is wrong', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('correct-horse')]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_confirmed_at' => now(),
    ])->save();

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/two-factor', ['password' => 'wrong'])
        ->assertUnprocessable();

    $user->refresh();
    expect($user->two_factor_confirmed_at)->not->toBeNull();
});

it('GET /me/two-factor returns the current enrolment shape', function (): void {
    $user = userWithAcademy();

    // Not enrolled
    $this->actingAs($user)
        ->getJson('/api/v1/me/two-factor')
        ->assertOk()
        ->assertJsonPath('data.enabled', false)
        ->assertJsonPath('data.pending', false);

    // Enrolment pending
    $user->forceFill(['two_factor_secret' => TwoFactorAuth::generateSecret()])->save();
    $this->actingAs($user)
        ->getJson('/api/v1/me/two-factor')
        ->assertOk()
        ->assertJsonPath('data.pending', true)
        ->assertJsonPath('data.enabled', false);

    // Active
    $user->forceFill([
        'two_factor_confirmed_at' => now(),
        'two_factor_recovery_codes' => TwoFactorAuth::generateRecoveryCodes(),
    ])->save();
    $this->actingAs($user)
        ->getJson('/api/v1/me/two-factor')
        ->assertOk()
        ->assertJsonPath('data.enabled', true)
        ->assertJsonPath('data.recovery_codes_remaining', 8);
});

// ─── Login challenge ──────────────────────────────────────────────────────────

it('login requires a two_factor_code body field when 2FA is active', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_confirmed_at' => now(),
    ])->save();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
    ])
        ->assertUnprocessable()
        ->assertJsonPath('message', 'two_factor_required');
});

it('login with a valid TOTP issues a Sanctum token', function (): void {
    $secret = TwoFactorAuth::generateSecret();
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);
    $user->forceFill([
        'two_factor_secret' => $secret,
        'two_factor_confirmed_at' => now(),
    ])->save();

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'two_factor_code' => new Google2FA()->getCurrentOtp($secret),
    ]);

    $response->assertOk()->assertJsonStructure(['data', 'token']);
});

it('login with an invalid TOTP returns 422 invalid_two_factor_code', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_confirmed_at' => now(),
    ])->save();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'two_factor_code' => '000000',
    ])
        ->assertUnprocessable()
        ->assertJsonPath('message', 'invalid_two_factor_code');
});

it('login with a valid backup code consumes the code and issues a token', function (): void {
    $codes = TwoFactorAuth::generateRecoveryCodes();
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_recovery_codes' => $codes,
        'two_factor_confirmed_at' => now(),
    ])->save();

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'two_factor_code' => $codes[0],
    ]);

    $response->assertOk();

    $user->refresh();
    expect(count($user->two_factor_recovery_codes))->toBe(7);
    expect($user->two_factor_recovery_codes)->not->toContain($codes[0]);
});

it('login with a backup code is one-shot — the same code does not work twice', function (): void {
    $codes = TwoFactorAuth::generateRecoveryCodes();
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);
    $user->forceFill([
        'two_factor_secret' => TwoFactorAuth::generateSecret(),
        'two_factor_recovery_codes' => $codes,
        'two_factor_confirmed_at' => now(),
    ])->save();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'two_factor_code' => $codes[0],
    ])->assertOk();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'two_factor_code' => $codes[0],
    ])
        ->assertUnprocessable()
        ->assertJsonPath('message', 'invalid_two_factor_code');
});
