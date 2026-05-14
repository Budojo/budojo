<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\ReactionEmoji;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\CommunityCommentOnYourPostNotification;
use App\Notifications\CommunityNewPostNotification;
use App\Notifications\CommunityReactionOnYourPostNotification;
use App\Support\NotificationCategory;
use Illuminate\Support\Facades\Notification;

/**
 * #729 Phase A community notifications (A5/A6/A7). Each pin:
 *   1. Happy-path dispatch reaches the right recipient.
 *   2. The author never self-pings.
 *   3. Category opt-out is honoured server-side.
 */

beforeEach(function (): void {
    Notification::fake();
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function notifMember(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return $user;
}

// -----------------------------------------------------------------------
// A6 — community_comment_on_your_post
// -----------------------------------------------------------------------

it('A6: notifies the post author when someone else comments on it', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();
    $commenter = notifMember($this->academy);

    $this->actingAs($commenter)
        ->postJson("/api/v1/community/posts/{$post->id}/comments", ['body' => 'nice post'])
        ->assertCreated();

    Notification::assertSentTo($this->owner, CommunityCommentOnYourPostNotification::class);
});

it('A6: does NOT notify the post author when they comment on their own post (no self-ping)', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();

    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$post->id}/comments", ['body' => 'my own comment'])
        ->assertCreated();

    Notification::assertNotSentTo($this->owner, CommunityCommentOnYourPostNotification::class);
});

it('A6: respects community_comment_on_your_post opt-out', function (): void {
    $this->owner->forceFill([
        'notification_preferences' => [NotificationCategory::COMMUNITY_COMMENT_ON_YOUR_POST => false],
    ])->save();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();
    $commenter = notifMember($this->academy);

    $this->actingAs($commenter)
        ->postJson("/api/v1/community/posts/{$post->id}/comments", ['body' => 'hello'])
        ->assertCreated();

    Notification::assertNotSentTo($this->owner, CommunityCommentOnYourPostNotification::class);
});

// -----------------------------------------------------------------------
// A7 — community_reaction_on_your_post
// -----------------------------------------------------------------------

it('A7: notifies the post author when someone reacts to their post', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();
    $reactor = notifMember($this->academy);

    $this->actingAs($reactor)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => ReactionEmoji::Clap->value])
        ->assertOk();

    Notification::assertSentTo($this->owner, CommunityReactionOnYourPostNotification::class);
});

it('A7: does NOT notify the post author when they react to their own post', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();

    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => ReactionEmoji::Clap->value])
        ->assertOk();

    Notification::assertNotSentTo($this->owner, CommunityReactionOnYourPostNotification::class);
});

it('A7: respects community_reaction_on_your_post opt-out', function (): void {
    $this->owner->forceFill([
        'notification_preferences' => [NotificationCategory::COMMUNITY_REACTION_ON_YOUR_POST => false],
    ])->save();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();
    $reactor = notifMember($this->academy);

    $this->actingAs($reactor)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => ReactionEmoji::Pray->value])
        ->assertOk();

    Notification::assertNotSentTo($this->owner, CommunityReactionOnYourPostNotification::class);
});

it('A7: does NOT fire on a toggle-off (removing your own reaction)', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->for($this->owner, 'createdBy')->create();
    $reactor = notifMember($this->academy);

    // First call: react (fires A7) → owner gets one notification.
    $this->actingAs($reactor)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => ReactionEmoji::Clap->value])
        ->assertOk();
    // Second call: same emoji → toggle-off. Should NOT fire a second
    // notification — the spam path the docblock guards against.
    $this->actingAs($reactor)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => ReactionEmoji::Clap->value])
        ->assertOk();

    Notification::assertSentToTimes($this->owner, CommunityReactionOnYourPostNotification::class, 1);
});

// -----------------------------------------------------------------------
// A5 — community_new_post (belt promotion fanout path)
// -----------------------------------------------------------------------

it('A5: notifies an opted-in academy member when a belt promotion creates a new post', function (): void {
    $recipient = notifMember($this->academy);

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertSentTo($recipient, CommunityNewPostNotification::class);
});

it('A5: does NOT notify the editor (no self-ping on the post they triggered)', function (): void {
    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($this->owner, CommunityNewPostNotification::class);
});

it('A5: respects community_new_post opt-out', function (): void {
    $recipient = notifMember($this->academy);
    $recipient->forceFill([
        'notification_preferences' => [NotificationCategory::COMMUNITY_NEW_POST => false],
    ])->save();

    /** @var Athlete $subject */
    $subject = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);
    $subject->update(['belt' => Belt::Blue]);

    Notification::assertNotSentTo($recipient, CommunityNewPostNotification::class);
});
