<?php

declare(strict_types=1);

use App\Models\PushSubscription;
use Illuminate\Support\Str;

function pushPayload(string $endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): array
{
    return [
        'endpoint' => $endpoint,
        'keys' => [
            'p256dh' => Str::random(86),
            'auth' => Str::random(22),
        ],
    ];
}

it('GET /me/push-subscriptions returns the user\'s rows + VAPID public key', function (): void {
    $user = userWithAcademy();
    PushSubscription::factory()->for($user)->count(2)->create();

    $response = $this->actingAs($user)->getJson('/api/v1/me/push-subscriptions');

    $response->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.enabled', true)
        ->assertJsonStructure(['data' => [['id', 'endpoint_host', 'endpoint_hash', 'last_seen_at', 'created_at']]]);
    expect($response->json('meta.vapid_public_key'))->toBeString();
});

it('GET /me/push-subscriptions exposes endpoint_hash so the SPA can match the current device (#822)', function (): void {
    $user = userWithAcademy();
    $endpoint = 'https://fcm.googleapis.com/fcm/send/known-endpoint';
    $expectedHash = hash('sha256', $endpoint);
    // The factory's `endpoint_hash` is computed from its own random
    // `endpoint` inside `definition()`; passing `endpoint` alone via
    // `create()` overrides ONLY that field, leaving the hash detached.
    // For this round-trip assertion we set both explicitly so the row
    // mirrors the production shape (controller `store()` writes both).
    $sub = PushSubscription::factory()->for($user)->create([
        'endpoint' => $endpoint,
        'endpoint_hash' => $expectedHash,
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/push-subscriptions');

    $response->assertOk();
    $row = $response->json('data.0');
    // The returned hash is the sha256 of the endpoint URL — the SPA
    // computes the same hash from the current browser's PushSubscription
    // and matches against this field to know which row is "this device".
    expect($row['endpoint_hash'])->toBe($expectedHash);
    expect($row['endpoint_hash'])->toBe($sub->endpoint_hash);
    // Shape: 64-char lowercase hex.
    expect($row['endpoint_hash'])->toMatch('/^[a-f0-9]{64}$/');
});

it('GET /me/push-subscriptions never includes another user\'s rows', function (): void {
    $alice = userWithAcademy();
    $bob = userWithAcademy();
    PushSubscription::factory()->for($alice)->create();
    PushSubscription::factory()->for($bob)->create();

    $response = $this->actingAs($alice)->getJson('/api/v1/me/push-subscriptions');
    $response->assertOk()->assertJsonCount(1, 'data');
});

it('POST /me/push-subscriptions stores a new subscription (201)', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions', pushPayload());

    $response->assertCreated()
        ->assertJsonStructure(['data' => ['id', 'endpoint_host', 'created_at']]);
    expect(PushSubscription::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('POST /me/push-subscriptions is idempotent on (user, endpoint) — 200 on re-post', function (): void {
    $user = userWithAcademy();
    $payload = pushPayload();

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions', $payload)
        ->assertCreated();
    $second = $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions', $payload);
    $second->assertOk();

    expect(PushSubscription::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('POST /me/push-subscriptions returns 503 when VAPID is not configured', function (): void {
    config()->set('push.vapid.public_key', '');
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions', pushPayload())
        ->assertStatus(503);
});

it('POST /me/push-subscriptions rejects a missing keys payload', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions', [
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/x',
            'keys' => [],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['keys.p256dh', 'keys.auth']);
});

it('DELETE /me/push-subscriptions/{id} revokes a subscription', function (): void {
    $user = userWithAcademy();
    $sub = PushSubscription::factory()->for($user)->create();

    $this->actingAs($user)
        ->deleteJson("/api/v1/me/push-subscriptions/{$sub->id}")
        ->assertOk()
        ->assertJsonPath('data.revoked', true);

    expect(PushSubscription::query()->find($sub->id))->toBeNull();
});

it('DELETE /me/push-subscriptions/{id} 404s on another user\'s row', function (): void {
    $alice = userWithAcademy();
    $bob = userWithAcademy();
    $sub = PushSubscription::factory()->for($alice)->create();

    $this->actingAs($bob)
        ->deleteJson("/api/v1/me/push-subscriptions/{$sub->id}")
        ->assertNotFound();

    expect(PushSubscription::query()->find($sub->id))->not->toBeNull();
});

it('all push endpoints 401 without authentication', function (): void {
    $this->getJson('/api/v1/me/push-subscriptions')->assertUnauthorized();
    $this->postJson('/api/v1/me/push-subscriptions', pushPayload())->assertUnauthorized();
    $this->postJson('/api/v1/me/push-subscriptions/test')->assertUnauthorized();
    $this->deleteJson('/api/v1/me/push-subscriptions/1')->assertUnauthorized();
});

// ─── POST /me/push-subscriptions/test — user-triggered diagnostic ping (#819) ─

it('POST /me/push-subscriptions/test dispatches TestPushNotification to the calling user', function (): void {
    $user = userWithAcademy();
    PushSubscription::factory()->for($user)->create();
    Illuminate\Support\Facades\Notification::fake();

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions/test')
        ->assertOk()
        ->assertJsonPath('data.sent', true);

    Illuminate\Support\Facades\Notification::assertSentTo($user, App\Notifications\TestPushNotification::class);
});

it('POST /me/push-subscriptions/test returns 503 with structured reason when the dispatch throws (#828)', function (): void {
    $user = userWithAcademy();
    PushSubscription::factory()->for($user)->create();
    // Anonymous ChannelManager with empty constructor so the throw propagates to the controller's catch instead of being swallowed by Notification::fake().
    Illuminate\Support\Facades\Notification::swap(new class () extends Illuminate\Notifications\ChannelManager {
        public function __construct()
        {
        }

        public function send($notifiables, $instance, ?array $channels = null): void
        {
            throw new \RuntimeException('VAPID signing failed');
        }

        public function sendNow($notifiables, $instance, ?array $channels = null): void
        {
            throw new \RuntimeException('VAPID signing failed');
        }
    });

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions/test')
        ->assertStatus(503)
        ->assertJsonPath('message', 'Could not dispatch the test notification.')
        ->assertJsonPath('reason', 'dispatch_failed');
});

it('POST /me/push-subscriptions/test returns 422 when the user has no subscriptions', function (): void {
    $user = userWithAcademy();
    Illuminate\Support\Facades\Notification::fake();

    $this->actingAs($user)
        ->postJson('/api/v1/me/push-subscriptions/test')
        ->assertStatus(422)
        ->assertJsonPath('message', 'No push subscriptions registered for this user.');

    Illuminate\Support\Facades\Notification::assertNothingSent();
});

it('POST /me/push-subscriptions/test never reaches subscriptions belonging to another user', function (): void {
    $alice = userWithAcademy();
    $bob = userWithAcademy();
    PushSubscription::factory()->for($alice)->create();
    PushSubscription::factory()->for($bob)->create();
    Illuminate\Support\Facades\Notification::fake();

    $this->actingAs($alice)->postJson('/api/v1/me/push-subscriptions/test')->assertOk();

    Illuminate\Support\Facades\Notification::assertSentTo($alice, App\Notifications\TestPushNotification::class);
    Illuminate\Support\Facades\Notification::assertNotSentTo($bob, App\Notifications\TestPushNotification::class);
});
