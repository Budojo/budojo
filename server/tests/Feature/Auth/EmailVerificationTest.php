<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;

it('queues a verification email when a new user registers', function (): void {
    Notification::fake();

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertCreated();

    $user = User::where('email', 'mario@example.com')->firstOrFail();

    expect($user->hasVerifiedEmail())->toBeFalse();
    Notification::assertSentTo($user, VerifyEmail::class);
});

it('exposes email_verified_at on the registered user resource', function (): void {
    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ]);

    $response->assertCreated()->assertJsonPath('data.email_verified_at', null);
});

it('resends the verification email when the authenticated user requests it', function (): void {
    Notification::fake();

    $user = User::factory()->unverified()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/email/verification-notification')
        ->assertNoContent();

    Notification::assertSentTo($user, VerifyEmail::class);
});

it('rejects resend for unauthenticated requests', function (): void {
    $this->postJson('/api/v1/email/verification-notification')
        ->assertUnauthorized();
});

it('returns 204 without sending when the user is already verified', function (): void {
    Notification::fake();

    $user = User::factory()->create(['email_verified_at' => now()]);

    $this->actingAs($user)
        ->postJson('/api/v1/email/verification-notification')
        ->assertNoContent();

    Notification::assertNothingSentTo($user);
});

it('rate-limits resend to one per minute per user', function (): void {
    Notification::fake();

    $user = User::factory()->unverified()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/email/verification-notification')
        ->assertNoContent();

    $this->actingAs($user)
        ->postJson('/api/v1/email/verification-notification')
        ->assertStatus(429);
});

it('verifies the user via a valid signed link and redirects to the SPA success page', function (): void {
    config(['app.client_url' => 'https://app.test']);

    $user = User::factory()->unverified()->create();
    $verifyUrl = signedVerifyUrl($user);

    $response = $this->get($verifyUrl);

    $response->assertRedirect('https://app.test/auth/verify-success');
    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
});

it('redirects already-verified users to the success page without re-verifying', function (): void {
    config(['app.client_url' => 'https://app.test']);

    $user = User::factory()->create(['email_verified_at' => now()->subDay()]);
    $verifiedAt = $user->email_verified_at;
    $verifyUrl = signedVerifyUrl($user);

    $this->get($verifyUrl)->assertRedirect('https://app.test/auth/verify-success');

    expect($user->fresh()->email_verified_at->equalTo($verifiedAt))->toBeTrue();
});

it('rejects an expired signed link with a redirect to verify-error', function (): void {
    config(['app.client_url' => 'https://app.test']);

    $user = User::factory()->unverified()->create();

    $expiredUrl = URL::temporarySignedRoute(
        'verification.verify',
        Carbon::now()->subHour(),
        ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())],
    );

    $this->get($expiredUrl)->assertRedirect('https://app.test/auth/verify-error');
    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
});

it('rejects a tampered signed link (id matches but signature does not) with verify-error redirect', function (): void {
    config(['app.client_url' => 'https://app.test']);

    $user = User::factory()->unverified()->create();
    $tampered = URL::route('verification.verify', [
        'id' => $user->getKey(),
        'hash' => sha1($user->getEmailForVerification()),
    ]) . '&signature=deadbeef';

    $this->get($tampered)->assertRedirect('https://app.test/auth/verify-error');
    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
});

it('rejects a signed link whose hash does not match the user email with verify-error redirect', function (): void {
    config(['app.client_url' => 'https://app.test']);

    $user = User::factory()->unverified()->create();

    $bogus = URL::temporarySignedRoute(
        'verification.verify',
        Carbon::now()->addHour(),
        ['id' => $user->getKey(), 'hash' => sha1('someone-else@example.com')],
    );

    $this->get($bogus)->assertRedirect('https://app.test/auth/verify-error');
    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
});

/**
 * Helper: build a valid signed verification URL for the given user. Mirrors
 * what Laravel's `VerifyEmail` notification does internally.
 */
function signedVerifyUrl(User $user): string
{
    return URL::temporarySignedRoute(
        'verification.verify',
        Carbon::now()->addHour(),
        ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())],
    );
}
