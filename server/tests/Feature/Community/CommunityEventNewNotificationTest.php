<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
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

it('notifies the academy owner when a non-owner user creates the event (owner social, #639)', function (): void {
    // Models the multi-owner future the owner-side community surface
    // anticipates: someone OTHER than the academy's primary owner
    // posts an event under the academy. The recipient set must
    // include the primary owner; the editing user must be excluded.
    //
    // The endpoint's authorize() gate is exercised in the dedicated
    // CommunityCreateEventApiTest spec (athlete 403, no-academy 403);
    // here we invoke the Action directly to keep the assertion
    // focused on fanout behaviour, not on the HTTP boundary
    // (Copilot review on #639).
    Notification::fake();

    /** @var User $editor */
    $editor = User::factory()->create(['role' => 'owner']);

    $action = app(\App\Actions\Community\CreateEventAction::class);
    $action->execute($editor, $this->academy->id, [
        'title' => 'Direct-action event',
        'starts_at' => '2026-06-13T10:00:00Z',
    ]);

    Notification::assertSentTo($this->owner, CommunityEventNewNotification::class);
    Notification::assertNotSentTo($editor, CommunityEventNewNotification::class);
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
    $data = $notification->toDatabase(new User(['role' => 'owner']));

    expect($data['title'])->toBe('New event');
});

it('via() includes the WebPushChannel and toWebPush() mirrors the database shape (#702)', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create([
        'payload' => [
            'title' => 'Open mat',
            'starts_at' => '2026-06-01T18:00:00+00:00',
            'location_text' => 'Academy Gracie Milano',
        ],
    ]);
    $notification = new CommunityEventNewNotification($post);

    expect($notification->via(new User(['role' => 'owner'])))->toContain(WebPushChannel::class);
    expect($notification->toWebPush(new User(['role' => 'owner'])))
        ->toMatchArray($notification->toDatabase(new User(['role' => 'owner'])));
});
