<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Models\User;

/**
 * The owner's session on a local device, with no password (#2079, PRD § 5.4):
 * the door signs in with Google, and the app asks its own server for the
 * owner's token with the secret only the shell holds.
 */
beforeEach(function (): void {
    config()->set('budojo.runtime', 'mobile');
    config()->set('budojo.shell.secret', 'shell-secret-for-the-tests');
});

function deviceSession(mixed $test, ?string $secret = 'shell-secret-for-the-tests'): \Illuminate\Testing\TestResponse
{
    return $test->postJson('/api/v1/device/session', [], $secret === null ? [] : ['X-Budojo-Shell' => $secret]);
}

it('hands the shell\'s page the owner\'s session, as a login does', function (): void {
    $owner = userWithAcademy();

    $token = deviceSession($this)
        ->assertOk()
        ->assertJsonPath('data.email', $owner->email)
        ->json('token');

    $this->withToken((string) $token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $owner->id);
});

it('makes the session a sign-in of this device, revocable like one', function (): void {
    $owner = userWithAcademy();

    deviceSession($this)->assertOk();

    expect($owner->tokens()->sole()->kind)->toBe('desktop');
});

it('opens the owner\'s, never an athlete\'s', function (): void {
    User::factory()->create(['role' => UserRole::Athlete]);
    $owner = userWithAcademy();

    deviceSession($this)->assertOk()->assertJsonPath('data.id', $owner->id);
});

it('says so on a device nobody has set up yet', function (): void {
    deviceSession($this)->assertNotFound()->assertJsonPath('code', 'no_owner');
});

describe('who may ask', function (): void {
    beforeEach(function (): void {
        userWithAcademy();
    });

    it('is nobody without the shell\'s secret: any other app on the phone reaches 127.0.0.1 too', function (): void {
        deviceSession($this, null)->assertNotFound();
        deviceSession($this, 'a-guess')->assertNotFound();
    });

    it('is nobody when the shell gave no secret', function (): void {
        config()->set('budojo.shell.secret', null);

        deviceSession($this, '')->assertNotFound();
    });

    it('is nobody on the web, where there is no shell', function (): void {
        config()->set('budojo.runtime', 'web');

        deviceSession($this)->assertNotFound();
    });
});
