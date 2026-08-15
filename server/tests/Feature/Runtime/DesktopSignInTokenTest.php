<?php

declare(strict_types=1);

use App\Enums\TokenKind;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Sign-in tokens by runtime profile, and the logout that revokes them (#1227).
 */

function signIn(string $email, string $password = 'Password1!'): string
{
    $response = test()->postJson('/api/v1/auth/login', ['email' => $email, 'password' => $password]);
    $response->assertOk();

    return $response->json('token');
}

it('marks a web sign-in token as a session', function (): void {
    config()->set('budojo.runtime', 'web');
    User::factory()->create(['email' => 'web@example.test', 'password' => Hash::make('Password1!')]);

    signIn('web@example.test');

    expect(PersonalAccessToken::query()->firstOrFail()->kind)->toBe(TokenKind::Session->value);
});

it('marks a desktop sign-in token as desktop, so the shell\'s credential is distinguishable', function (): void {
    config()->set('budojo.runtime', 'desktop');
    User::factory()->create(['email' => 'desk@example.test', 'password' => Hash::make('Password1!')]);

    signIn('desk@example.test');

    expect(PersonalAccessToken::query()->firstOrFail()->kind)->toBe(TokenKind::Desktop->value);
});

it('marks a registration token the same way', function (): void {
    config()->set('budojo.runtime', 'desktop');

    test()->postJson('/api/v1/auth/register', [
        'first_name' => 'Owner',
        'last_name' => 'Desktop',
        'email' => 'new@desktop.test',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated();

    expect(PersonalAccessToken::query()->firstOrFail()->kind)->toBe(TokenKind::Desktop->value);
});

it('lists a desktop token among the active sessions so it can be revoked like one', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $user = User::factory()->create(['email' => 'desk@example.test', 'password' => Hash::make('Password1!')]);
    $token = signIn('desk@example.test');

    test()->withToken($token)->getJson('/api/v1/me/sessions')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('keeps api tokens out of the sessions list', function (): void {
    $user = User::factory()->create();
    $user->createToken('script')->accessToken->forceFill(['kind' => TokenKind::Api->value])->save();
    $session = $user->createToken('browser')->plainTextToken;

    test()->withToken($session)->getJson('/api/v1/me/sessions')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('revokes the current token on logout and rejects it afterwards', function (): void {
    User::factory()->create(['email' => 'out@example.test', 'password' => Hash::make('Password1!')]);
    $token = signIn('out@example.test');

    test()->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();

    expect(PersonalAccessToken::query()->count())->toBe(0);
    // The guard caches the resolved user for the test process; a real second
    // request starts cold. Drop the cache to model it.
    app('auth')->forgetGuards();
    test()->withToken($token)->getJson('/api/v1/auth/me')->assertUnauthorized();
});

it('requires authentication to log out', function (): void {
    test()->postJson('/api/v1/auth/logout')->assertUnauthorized();
});
