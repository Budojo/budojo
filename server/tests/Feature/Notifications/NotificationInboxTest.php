<?php

declare(strict_types=1);

use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Spin up a database notification row for the given user. Mirrors
 * what `$user->notify(new Notification)` would produce when the
 * Notification implements `toDatabase()` — kept inline here so the
 * feature tests don't depend on a concrete Notification class.
 *
 * @param array<string, mixed>|null $data
 */
function makeDbNotification(\App\Models\User $user, ?array $data = null, ?Carbon $readAt = null): DatabaseNotification
{
    return DatabaseNotification::create([
        'id' => (string) Str::uuid(),
        'type' => 'App\\Notifications\\TestNotification',
        'notifiable_type' => \App\Models\User::class,
        'notifiable_id' => $user->id,
        'data' => $data ?? [
            'title' => 'Medical certificate expiring soon',
            'body' => 'Mario Rossi — certificate expires in 7 days.',
            'link' => '/dashboard/athletes/42/documents',
        ],
        'read_at' => $readAt,
    ]);
}

it('GET /me/notifications returns the latest 20 rows for the authed user', function (): void {
    $user = userWithAcademy();
    // Create 25 — only the 20 newest should land in the response.
    foreach (range(1, 25) as $i) {
        $row = makeDbNotification($user, ['title' => "Reminder #{$i}", 'body' => '', 'link' => null]);
        $row->created_at = now()->subMinutes(25 - $i);
        $row->save();
    }

    $response = $this->actingAs($user)->getJson('/api/v1/me/notifications');
    $response->assertOk();
    expect(count($response->json('data')))->toBe(20);
    // Newest first.
    expect($response->json('data.0.title'))->toBe('Reminder #25');
});

it('GET /me/notifications unread_count reflects rows with read_at IS NULL', function (): void {
    $user = userWithAcademy();
    makeDbNotification($user);
    makeDbNotification($user);
    makeDbNotification($user, null, readAt: now());

    $response = $this->actingAs($user)->getJson('/api/v1/me/notifications');
    $response->assertOk()
        ->assertJsonPath('meta.unread_count', 2);
});

it("GET /me/notifications never leaks another user's rows", function (): void {
    $a = userWithAcademy();
    $b = userWithAcademy();
    makeDbNotification($a, ['title' => 'For A', 'body' => '', 'link' => null]);
    makeDbNotification($b, ['title' => 'For B', 'body' => '', 'link' => null]);

    $response = $this->actingAs($a)->getJson('/api/v1/me/notifications');
    $response->assertOk();
    expect(count($response->json('data')))->toBe(1);
    expect($response->json('data.0.title'))->toBe('For A');
});

it('POST /me/notifications/{id}/read flips read_at to now', function (): void {
    $user = userWithAcademy();
    $row = makeDbNotification($user);

    $this->actingAs($user)
        ->postJson("/api/v1/me/notifications/{$row->id}/read")
        ->assertOk()
        ->assertJsonPath('data.id', $row->id);

    $row->refresh();
    expect($row->read_at)->not->toBeNull();
});

it('POST /me/notifications/{id}/read is idempotent on an already-read row', function (): void {
    $user = userWithAcademy();
    $row = makeDbNotification($user, null, readAt: now()->subHour());
    $originalReadAt = $row->read_at;

    $this->actingAs($user)
        ->postJson("/api/v1/me/notifications/{$row->id}/read")
        ->assertOk();

    $row->refresh();
    expect($row->read_at->equalTo($originalReadAt))->toBeTrue();
});

it("POST /me/notifications/{id}/read 404s on another user's row", function (): void {
    $a = userWithAcademy();
    $b = userWithAcademy();
    $row = makeDbNotification($a);

    $this->actingAs($b)
        ->postJson("/api/v1/me/notifications/{$row->id}/read")
        ->assertNotFound();
});

it('POST /me/notifications/read-all flips every unread row + returns count', function (): void {
    $user = userWithAcademy();
    makeDbNotification($user);
    makeDbNotification($user);
    makeDbNotification($user, null, readAt: now()->subDay());

    $this->actingAs($user)
        ->postJson('/api/v1/me/notifications/read-all')
        ->assertOk()
        ->assertJsonPath('data.marked_read', 2);

    expect($user->unreadNotifications()->count())->toBe(0);
});

it('inbox endpoints all 401 without authentication', function (): void {
    $this->getJson('/api/v1/me/notifications')->assertUnauthorized();
    $this->postJson('/api/v1/me/notifications/00000000-0000-4000-8000-000000000000/read')
        ->assertUnauthorized();
    $this->postJson('/api/v1/me/notifications/read-all')->assertUnauthorized();
});
