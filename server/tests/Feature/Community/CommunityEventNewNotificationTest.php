<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use App\Notifications\CommunityEventNewNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Notification;

/**
 * M9 PR-F slice 2 (#606) — feature tests for the
 * community_event_new inbox-notification fanout.
 *
 * When an owner creates an event-type community post via
 * `POST /api/v1/community/events`, the CreateEventAction fans out
 * an inbox notification to every academy user EXCEPT the editor —
 * gated on `community_event_new`, which is **default-on** (events
 * are scarce enough not to need an explicit opt-in posture).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function eventAthlete(Academy $academy, ?bool $optIn = null): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);
    if ($optIn !== null) {
        NotificationPreferences::update($user, [
            NotificationCategory::COMMUNITY_EVENT_NEW => $optIn,
        ]);
    }

    return $user;
}

function postEvent(User $owner, array $overrides = []): \Illuminate\Testing\TestResponse
{
    return test()->actingAs($owner)->postJson('/api/v1/community/events', array_merge([
        'title' => 'Open mat — Saturday',
        'starts_at' => '2026-06-13T10:00:00Z',
    ], $overrides));
}

it('notifies every academy user (excluding the editor) when a new event is created', function (): void {
    Notification::fake();

    $a = eventAthlete($this->academy);
    $b = eventAthlete($this->academy);

    postEvent($this->owner)->assertCreated();

    Notification::assertSentTo($a, CommunityEventNewNotification::class);
    Notification::assertSentTo($b, CommunityEventNewNotification::class);
});

it('does NOT notify the editor who created the event', function (): void {
    Notification::fake();

    postEvent($this->owner)->assertCreated();

    Notification::assertNotSentTo($this->owner, CommunityEventNewNotification::class);
});

it('notifies the academy owner when ANOTHER user creates the event (owner social, #638)', function (): void {
    Notification::fake();

    // Build a second user with the owner role attached to the same
    // academy (e.g. a future co-owner). They're the editor; the
    // primary owner of the academy should receive the inbox row.
    /** @var User $coOwner */
    $coOwner = User::factory()->create(['role' => 'owner']);

    test()->actingAs($coOwner)->postJson('/api/v1/community/events', [
        'title' => 'Open mat — Saturday',
        'starts_at' => '2026-06-13T10:00:00Z',
        // The endpoint reads $user->academy, so for this multi-owner
        // case we go straight to the Action with the academy id.
    ])->assertStatus(403); // co-owner has no linked academy → 403

    // Direct Action invocation models the multi-owner case the
    // endpoint will support later. The owner of the academy is the
    // intended recipient; the editor (co-owner) is excluded.
    $action = app(\App\Actions\Community\CreateEventAction::class);
    $action->execute($coOwner, $this->academy->id, [
        'title' => 'Direct-action event',
        'starts_at' => '2026-06-13T10:00:00Z',
    ]);

    Notification::assertSentTo($this->owner, CommunityEventNewNotification::class);
    Notification::assertNotSentTo($coOwner, CommunityEventNewNotification::class);
});

it('default-on: a user with no preference set DOES receive the event notification', function (): void {
    Notification::fake();

    $a = eventAthlete($this->academy);

    postEvent($this->owner)->assertCreated();

    Notification::assertSentTo($a, CommunityEventNewNotification::class);
});

it('skips users who opted OUT of community_event_new', function (): void {
    Notification::fake();

    $optedOut = eventAthlete($this->academy, false);
    $optedIn = eventAthlete($this->academy, true);

    postEvent($this->owner)->assertCreated();

    Notification::assertNotSentTo($optedOut, CommunityEventNewNotification::class);
    Notification::assertSentTo($optedIn, CommunityEventNewNotification::class);
});

it('does not leak across academies', function (): void {
    Notification::fake();

    $otherOwner = userWithAcademy();
    /** @var Academy $otherAcademy */
    $otherAcademy = $otherOwner->academy;
    $stranger = eventAthlete($otherAcademy);

    postEvent($this->owner)->assertCreated();

    Notification::assertNotSentTo($stranger, CommunityEventNewNotification::class);
});

it('persists the event notification to the inbox with the expected wire shape', function (): void {
    $a = eventAthlete($this->academy);

    postEvent($this->owner, [
        'title' => 'Open mat — Saturday',
        'starts_at' => '2026-06-13T10:00:00Z',
        'location_text' => 'Via Roma 10, Milano',
    ])->assertCreated();

    /** @var \Illuminate\Notifications\DatabaseNotification|null $row */
    $row = $a->notifications()->first();
    expect($row)->not->toBeNull();
    /** @var array<string, mixed> $data */
    $data = $row->data;
    expect($data['kind'])->toBe('community_event_new')
        ->and($data['title'])->toContain('Open mat')
        ->and($data['link'])->toStartWith('/dashboard/me/feed#post-')
        ->and($data['post_id'])->toBeInt();
});

it('falls back to a bare "New event" title when the payload title is missing or blank', function (): void {
    // Hit the notification class directly with a hand-built post that
    // has no title in its payload — the HTTP endpoint requires title,
    // so this exercises the defensive fallback the notification
    // carries for malformed / legacy rows (Copilot review on #634).
    /** @var App\Models\CommunityPost $post */
    $post = App\Models\CommunityPost::create([
        'academy_id' => $this->academy->id,
        'type' => App\Enums\CommunityPostType::Event,
        'visibility' => App\Enums\CommunityPostVisibility::Academy,
        'payload' => [
            'title' => '   ',
            'description' => null,
            'starts_at' => '2026-06-13T10:00:00Z',
        ],
        'created_by_user_id' => $this->owner->id,
    ]);

    $notification = new App\Notifications\CommunityEventNewNotification($post);
    /** @var array<string, mixed> $data */
    $data = $notification->toDatabase((object) []);

    expect($data['title'])->toBe('New event');
});
