<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;
use App\Notifications\CommunityReplyNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Notification;

/**
 * M9 PR-F slice 1 (#606) — feature tests for the community-reply
 * inbox-notification fanout. When a new comment lands under a post,
 * every prior sibling commenter (modulo opt-out + the new author)
 * receives a `CommunityReplyNotification`.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create();
    $this->post = $post;
});

function notifAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return $user;
}

it('notifies every prior sibling commenter (excluding the new author)', function (): void {
    Notification::fake();

    $a = notifAthlete($this->academy);
    $b = notifAthlete($this->academy);
    $c = notifAthlete($this->academy);

    // a + b previously commented; c hasn't.
    PostComment::factory()->for($this->post, 'post')->for($a)->create();
    PostComment::factory()->for($this->post, 'post')->for($b)->create();

    // c posts a new comment.
    $this->actingAs($c)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'thanks for sharing'])
        ->assertCreated();

    Notification::assertSentTo($a, CommunityReplyNotification::class);
    Notification::assertSentTo($b, CommunityReplyNotification::class);
    Notification::assertNotSentTo($c, CommunityReplyNotification::class);
});

it("does NOT notify the new comment's own author even if they have prior comments on the post", function (): void {
    Notification::fake();

    $a = notifAthlete($this->academy);
    PostComment::factory()->for($this->post, 'post')->for($a)->create();

    // a posts another comment under the same post.
    $this->actingAs($a)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'one more thing'])
        ->assertCreated();

    Notification::assertNothingSent();
});

it('skips recipients who opted out of community_reply', function (): void {
    Notification::fake();

    $a = notifAthlete($this->academy);
    $b = notifAthlete($this->academy);

    NotificationPreferences::update($a, [NotificationCategory::COMMUNITY_REPLY => false]);
    NotificationPreferences::update($b, [NotificationCategory::COMMUNITY_REPLY => true]);

    PostComment::factory()->for($this->post, 'post')->for($a)->create();
    PostComment::factory()->for($this->post, 'post')->for($b)->create();

    $c = notifAthlete($this->academy);
    $this->actingAs($c)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'ok'])
        ->assertCreated();

    Notification::assertNotSentTo($a, CommunityReplyNotification::class);
    Notification::assertSentTo($b, CommunityReplyNotification::class);
});

it('treats absent preference as opted-in (default on)', function (): void {
    Notification::fake();

    $a = notifAthlete($this->academy);
    // No preference write — a's notification_preferences column is null.
    PostComment::factory()->for($this->post, 'post')->for($a)->create();

    $b = notifAthlete($this->academy);
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'hello'])
        ->assertCreated();

    Notification::assertSentTo($a, CommunityReplyNotification::class);
});

it('persists the notification to the inbox with the expected wire shape', function (): void {
    // No Notification::fake() — exercise the real database channel.
    $a = notifAthlete($this->academy);
    PostComment::factory()->for($this->post, 'post')->for($a)->create();

    $b = notifAthlete($this->academy);
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'congrats!'])
        ->assertCreated();

    /** @var \Illuminate\Notifications\DatabaseNotification|null $row */
    $row = $a->notifications()->first();
    expect($row)->not->toBeNull();
    /** @var array<string, mixed> $data */
    $data = $row->data;
    expect($data['kind'])->toBe('community_reply')
        ->and($data['post_id'])->toBe($this->post->id)
        ->and($data['body'])->toBe('congrats!')
        ->and($data['link'])->toBe("/dashboard/me/feed#post-{$this->post->id}");
});

it('notifies only ONCE per distinct user, even if they have multiple prior comments', function (): void {
    Notification::fake();

    $a = notifAthlete($this->academy);
    // a comments 3 times on the same post.
    PostComment::factory()->for($this->post, 'post')->for($a)->count(3)->create();

    $b = notifAthlete($this->academy);
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'hi'])
        ->assertCreated();

    Notification::assertSentToTimes($a, CommunityReplyNotification::class, 1);
});

it('does not fanout to commenters on a different post', function (): void {
    Notification::fake();

    /** @var CommunityPost $otherPost */
    $otherPost = CommunityPost::factory()->for($this->academy)->create();

    $a = notifAthlete($this->academy);
    PostComment::factory()->for($otherPost, 'post')->for($a)->create();

    $b = notifAthlete($this->academy);
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'on the other thread'])
        ->assertCreated();

    Notification::assertNotSentTo($a, CommunityReplyNotification::class);
});
