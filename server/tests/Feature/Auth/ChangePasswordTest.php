<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;

beforeEach(function (): void {
    // Clear the throttle limiter so a flood of requests in one test
    // doesn't bleed into the next (PEST tests share the limiter store).
    RateLimiter::clear('throttle:5,1');
});

// =====================================================================
// POST /api/v1/me/password — happy path
// =====================================================================

it('updates the password when the current one is correct', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'OldPassword1!',
            'password' => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Password updated.');

    $user->refresh();
    expect(Hash::check('NewPassword1!', $user->password))->toBeTrue();

    // Smoke-test: the new credentials work end-to-end via the login route.
    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'NewPassword1!',
    ])->assertOk();
});

// =====================================================================
// POST /api/v1/me/password — unhappy paths
// =====================================================================

it('rejects the request with 422 when the current password is wrong', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'definitely-wrong',
            'password' => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['current_password']);

    // Password unchanged.
    $user->refresh();
    expect(Hash::check('OldPassword1!', $user->password))->toBeTrue();
});

it('rejects the request with 422 when the new password is the same as the current one', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('SamePassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'SamePassword1!',
            'password' => 'SamePassword1!',
            'password_confirmation' => 'SamePassword1!',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    // Password unchanged.
    $user->refresh();
    expect(Hash::check('SamePassword1!', $user->password))->toBeTrue();
});

it('rejects the request with 422 when the new password is too short', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'OldPassword1!',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);
});

it('rejects the request with 422 when the new password confirmation does not match', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'OldPassword1!',
            'password' => 'NewPassword1!',
            'password_confirmation' => 'Mismatch1!',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);
});

it('returns 401 when the request is unauthenticated', function (): void {
    $this->postJson('/api/v1/me/password', [
        'current_password' => 'whatever',
        'password' => 'NewPassword1!',
        'password_confirmation' => 'NewPassword1!',
    ])->assertUnauthorized();
});

// =====================================================================
// Token revocation — defence-in-depth without logging out the user
// =====================================================================

it('revokes other Sanctum tokens but preserves the one used for the request', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    // Three concurrent sessions: phone, laptop, tablet. The user issues
    // the change-password from "laptop"; the other two must die.
    $phoneToken = $user->createToken('phone');
    $laptopToken = $user->createToken('laptop');
    $tabletToken = $user->createToken('tablet');

    $this->withHeader('Authorization', 'Bearer ' . $laptopToken->plainTextToken)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'OldPassword1!',
            'password' => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])->assertOk();

    // Only the laptop's token row survives.
    $remaining = PersonalAccessToken::query()->where('tokenable_id', $user->id)->pluck('id')->all();
    expect($remaining)->toHaveCount(1)
        ->and($remaining[0])->toBe($laptopToken->accessToken->id);

    // Sanity: the surviving token still authenticates.
    $this->withHeader('Authorization', 'Bearer ' . $laptopToken->plainTextToken)
        ->getJson('/api/v1/auth/me')
        ->assertOk();
});

// =====================================================================
// Throttling
// =====================================================================

it('throttles change-password to 5 requests per minute', function (): void {
    $user = User::factory()->create([
        'password' => Hash::make('OldPassword1!'),
    ]);

    $token = $user->createToken('auth')->plainTextToken;

    // 5 wrong-password attempts return 422.
    foreach (range(1, 5) as $_) {
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/v1/me/password', [
                'current_password' => 'definitely-wrong',
                'password' => 'NewPassword1!',
                'password_confirmation' => 'NewPassword1!',
            ])->assertUnprocessable();
    }

    // The 6th hits the limiter.
    $this->withHeader('Authorization', 'Bearer ' . $token)
        ->postJson('/api/v1/me/password', [
            'current_password' => 'definitely-wrong',
            'password' => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])->assertStatus(429);
});
