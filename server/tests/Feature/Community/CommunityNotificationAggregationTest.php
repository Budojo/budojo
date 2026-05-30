<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;

/**
 * Slice C (#1139, epic #1128) — write-time aggregation of community
 * interaction notifications. A burst of reactions / comments / RSVPs on
 * one post collapses into a single unread inbox row ("X and N others …")
 * instead of N separate rows + N pushes. Folds while unread; a read row
 * starts a fresh notification on the next event. The most recent actor is
 * the one named.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create([
        'created_by_user_id' => $this->owner->id,
    ]);
    $this->post = $post;
});

function aggMember(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $u */
    $u = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $u->id]);

    return $u;
}

function aggReact(User $as, CommunityPost $post, string $emoji = 'clap'): void
{
    test()->actingAs($as)
        ->postJson("/api/v1/community/posts/{$post->id}/reactions", ['emoji' => $emoji])
        ->assertOk();
}

it('folds a second reaction into one unread row naming the most recent actor', function (): void {
    $a = aggMember($this->academy);
    $b = aggMember($this->academy);

    aggReact($a, $this->post);
    aggReact($b, $this->post);

    expect($this->owner->notifications()->count())->toBe(1);

    $row = $this->owner->notifications()->first();
    /** @var array<string, mixed> $data */
    $data = $row->data;
    expect($data['title'])->toBe("{$b->full_name} and 1 other reacted to your post")
        ->and($data['actor']['name'])->toBe($b->full_name) // most recent
        ->and($data['kind'])->toBe('community_reaction_on_your_post')
        ->and($row->read_at)->toBeNull();
});

it('counts additional distinct actors as "and N others"', function (): void {
    $a = aggMember($this->academy);
    $b = aggMember($this->academy);
    $c = aggMember($this->academy);

    aggReact($a, $this->post);
    aggReact($b, $this->post);
    aggReact($c, $this->post);

    expect($this->owner->notifications()->count())->toBe(1);
    $data = $this->owner->notifications()->first()->data;
    expect($data['title'])->toBe("{$c->full_name} and 2 others reacted to your post");
});

it('dedupes the same actor reacting again (emoji swap) — stays single-actor', function (): void {
    $a = aggMember($this->academy);

    aggReact($a, $this->post, 'clap');
    aggReact($a, $this->post, 'pray'); // swap re-notifies the same actor

    expect($this->owner->notifications()->count())->toBe(1);
    $data = $this->owner->notifications()->first()->data;
    expect($data['title'])->toBe("{$a->full_name} reacted to your post");
});

it('starts a fresh notification once the prior one is read', function (): void {
    $a = aggMember($this->academy);
    $b = aggMember($this->academy);

    aggReact($a, $this->post);
    $this->owner->notifications()->update(['read_at' => now()]);

    aggReact($b, $this->post);

    expect($this->owner->notifications()->count())->toBe(2)
        ->and($this->owner->unreadNotifications()->count())->toBe(1);

    $unread = $this->owner->unreadNotifications()->first();
    expect($unread->data['title'])->toBe("{$b->full_name} reacted to your post");
});

it('aggregates comments on your post', function (): void {
    $a = aggMember($this->academy);
    $b = aggMember($this->academy);

    $this->actingAs($a)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'Nice work'])
        ->assertCreated();
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'Agreed'])
        ->assertCreated();

    $rows = $this->owner->notifications()->where('data->kind', 'community_comment_on_your_post')->get();
    expect($rows)->toHaveCount(1)
        ->and($rows->first()->data['title'])->toBe("{$b->full_name} and 1 other commented on your post");
});

it('aggregates RSVPs on your event', function (): void {
    /** @var CommunityPost $event */
    $event = CommunityPost::factory()->for($this->academy)->event('Open mat')->create([
        'created_by_user_id' => $this->owner->id,
    ]);
    $a = aggMember($this->academy);
    $b = aggMember($this->academy);

    $this->actingAs($a)
        ->postJson("/api/v1/community/posts/{$event->id}/rsvp", ['response' => 'going'])
        ->assertOk();
    $this->actingAs($b)
        ->postJson("/api/v1/community/posts/{$event->id}/rsvp", ['response' => 'going'])
        ->assertOk();

    $rows = $this->owner->notifications()->where('data->kind', 'owner_event_rsvp')->get();
    expect($rows)->toHaveCount(1)
        ->and($rows->first()->data['title'])->toBe("{$b->full_name} and 1 other RSVP'd to your event");
});
