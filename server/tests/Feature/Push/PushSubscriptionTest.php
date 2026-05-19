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
        ->assertJsonStructure(['data' => [['id', 'endpoint_host', 'last_seen_at', 'created_at']]]);
    expect($response->json('meta.vapid_public_key'))->toBeString();
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
