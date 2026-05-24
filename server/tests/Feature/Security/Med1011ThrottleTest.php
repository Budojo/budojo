<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

// The array-cache throttle counter is process-scoped — `RefreshDatabase`
// doesn't reset it. Without an explicit clear, the throttle tests
// here would leak budget into one another (multiple routes share the
// `throttle:10,1` key, and `throttle:5,1` is also shared with the
// 2FA endpoints from #1007).
beforeEach(function (): void {
    RateLimiter::clear('throttle:30,1');
    RateLimiter::clear('throttle:10,1');
    RateLimiter::clear('throttle:5,1');
});

afterEach(function (): void {
    RateLimiter::clear('throttle:30,1');
    RateLimiter::clear('throttle:10,1');
    RateLimiter::clear('throttle:5,1');
});

it('POST /me/avatar is rate-limited (10/min per user) — closes the storage-flood window (#1011)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $this->actingAs($user);

    // Burn the 10-per-minute budget with valid uploads.
    for ($i = 0; $i < 10; $i++) {
        $file = UploadedFile::fake()->create('me.jpg', 5, 'image/jpeg');
        $this->postJson('/api/v1/me/avatar', ['avatar' => $file])
            ->assertSuccessful();
    }

    // The 11th call trips the throttle ceiling.
    $file = UploadedFile::fake()->create('me.jpg', 5, 'image/jpeg');
    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])
        ->assertStatus(429);
});

it('POST /me/api-tokens is rate-limited (10/min per user) — caps unbounded token mint (#1011)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $this->actingAs($user);

    // Burn the 10-per-minute budget with valid token mints.
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/api/v1/me/api-tokens', [
            'name' => "token-$i",
            'abilities' => ['athletes:read'],
        ])->assertCreated();
    }

    // The 11th call trips the throttle ceiling.
    $this->postJson('/api/v1/me/api-tokens', [
        'name' => 'over-budget',
        'abilities' => ['athletes:read'],
    ])->assertStatus(429);
});

it('POST /me/push-subscriptions/test is rate-limited (5/min per user) — caps vendor-fanout spam (#1011)', function (): void {
    Notification::fake();

    /** @var User $user */
    $user = User::factory()->create();
    $user->pushSubscriptions()->create([
        'endpoint' => 'https://fcm.googleapis.com/wp/throttle-test',
        'endpoint_hash' => hash('sha256', 'https://fcm.googleapis.com/wp/throttle-test'),
        'p256dh' => 'pk',
        'auth' => 'a',
    ]);
    $this->actingAs($user);

    // Burn the 5-per-minute budget.
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/me/push-subscriptions/test')
            ->assertOk();
    }

    // The 6th call trips the throttle ceiling.
    $this->postJson('/api/v1/me/push-subscriptions/test')
        ->assertStatus(429);
});
