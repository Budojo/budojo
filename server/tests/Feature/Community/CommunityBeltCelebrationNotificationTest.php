<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Notifications\CommunityBeltCelebrationNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Notification;

/**
 * M9 PR-F slice 3 (#606) — feature tests for the
 * community_belt_celebration inbox-notification fanout.
 *
 * When an athlete's belt column changes, the AthleteObserver
 * already creates the celebration `CommunityPost`. This slice
 * extends the observer to fan out an inbox notification to every
 * academy user EXCEPT the editor — gated on the user's
 * `community_belt_celebration` preference, which is **default-off**.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function celebAthlete(Academy $academy, ?bool $optIn = null): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);
    if ($optIn !== null) {
        NotificationPreferences::update($user, [
            NotificationCategory::COMMUNITY_BELT_CELEBRATION => $optIn,
        ]);
    }

    return $user;
}

it('notifies every opted-in academy user (excluding the editor) when an athlete is promoted', function (): void {
    Notification::fake();

    $aOptIn = celebAthlete($this->academy, true);
    $bOptIn = celebAthlete($this->academy, true);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertSentTo($aOptIn, CommunityBeltCelebrationNotification::class);
    Notification::assertSentTo($bOptIn, CommunityBeltCelebrationNotification::class);
});

it('does NOT notify the editor who recorded the promotion', function (): void {
    Notification::fake();

    NotificationPreferences::update($this->owner, [
        NotificationCategory::COMMUNITY_BELT_CELEBRATION => true,
    ]);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($this->owner, CommunityBeltCelebrationNotification::class);
});

it('default-off: a user with no preference set does NOT receive the celebration', function (): void {
    Notification::fake();

    // No preference write — community_belt_celebration is in defaultOff().
    $a = celebAthlete($this->academy);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($a, CommunityBeltCelebrationNotification::class);
});

it('skips users who opted OUT of community_belt_celebration', function (): void {
    Notification::fake();

    $optedOut = celebAthlete($this->academy, false);
    $optedIn = celebAthlete($this->academy, true);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($optedOut, CommunityBeltCelebrationNotification::class);
    Notification::assertSentTo($optedIn, CommunityBeltCelebrationNotification::class);
});

it('does not leak across academies', function (): void {
    Notification::fake();

    $otherOwner = userWithAcademy();
    /** @var Academy $otherAcademy */
    $otherAcademy = $otherOwner->academy;
    $stranger = celebAthlete($otherAcademy, true);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($stranger, CommunityBeltCelebrationNotification::class);
});

it('persists the celebration notification to the inbox with the expected wire shape', function (): void {
    // Real database channel.
    $a = celebAthlete($this->academy, true);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => Belt::White,
    ]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    /** @var \Illuminate\Notifications\DatabaseNotification|null $row */
    $row = $a->notifications()->first();
    expect($row)->not->toBeNull();
    /** @var array<string, mixed> $data */
    $data = $row->data;
    expect($data['kind'])->toBe('community_belt_celebration')
        ->and($data['athlete_id'])->toBe($subject->id)
        ->and($data['old_belt'])->toBe('white')
        ->and($data['new_belt'])->toBe('blue')
        ->and($data['title'])->toContain('Mario Rossi');
});

it('via() includes the WebPushChannel and toWebPush() mirrors the database shape (#702)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create();
    $notification = new CommunityBeltCelebrationNotification($athlete, $post, 'white', 'blue');

    expect($notification->via(new \stdClass()))->toContain(WebPushChannel::class);
    expect($notification->toWebPush(new \stdClass()))
        ->toMatchArray($notification->toDatabase(new \stdClass()));
});
