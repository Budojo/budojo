<?php

declare(strict_types=1);

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Enums\ReactionEmoji;
use App\Enums\RsvpResponse;
use App\Models\Academy;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\PostReaction;
use App\Models\PostRsvp;
use App\Models\User;
use Illuminate\Database\QueryException;

/**
 * PR-A — schema-only feature tests for the M9 community layer (#601).
 * Pins the migration invariants so a future refactor (e.g. dropping an
 * index, loosening a UNIQUE constraint) trips this suite before
 * anyone notices in production.
 *
 * No HTTP, no Action, no Observer — those live in PR-B onwards.
 */

it('builds a CommunityPost via the factory with the expected default shape', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->create();

    expect($post->id)->toBeInt()
        ->and($post->academy_id)->toBeInt()
        ->and($post->type)->toBe(CommunityPostType::OwnerAnnouncement)
        ->and($post->visibility)->toBe(CommunityPostVisibility::Academy)
        ->and($post->payload)->toBeArray()->toHaveKey('body')
        ->and($post->created_by_user_id)->toBeInt()
        ->and($post->deleted_at)->toBeNull();
});

it('builds a belt_promotion post with a structured payload', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->beltPromotion(42, 'white', 'blue')->create();

    expect($post->type)->toBe(CommunityPostType::BeltPromotion)
        ->and($post->payload)->toBe([
            'athlete_id' => 42,
            'old_belt' => 'white',
            'new_belt' => 'blue',
            'promoted_at' => $post->payload['promoted_at'],
        ])
        ->and($post->payload['promoted_at'])->toBeString();
});

it('builds an event post with the V2-forward nullable lat/lon columns in the payload', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->event('Open mat', '+2 weeks')->create();

    expect($post->type)->toBe(CommunityPostType::Event)
        ->and($post->payload)->toHaveKeys(['title', 'description', 'starts_at', 'location_text', 'location_address', 'location_lat', 'location_lon', 'max_attendees'])
        ->and($post->payload['title'])->toBe('Open mat')
        ->and($post->payload['location_lat'])->toBeNull()
        ->and($post->payload['location_lon'])->toBeNull();
});

it('cascades community_posts when their academy is hard-deleted', function (): void {
    $academy = Academy::factory()->create();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($academy)->create();

    $academy->forceDelete();

    expect(CommunityPost::query()->withTrashed()->where('id', $post->id)->exists())->toBeFalse();
});

it('cascades community_posts when their author user is hard-deleted', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->create(['created_by_user_id' => $user->id]);

    $user->forceDelete();

    expect(CommunityPost::query()->withTrashed()->where('id', $post->id)->exists())->toBeFalse();
});

it('soft-deletes a community_post and keeps the row recoverable until forceDelete', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->create();

    $post->delete();

    expect(CommunityPost::query()->where('id', $post->id)->exists())->toBeFalse()
        ->and(CommunityPost::query()->withTrashed()->where('id', $post->id)->exists())->toBeTrue();
});

it('enforces UNIQUE(post_id, user_id) on post_reactions — one reaction per user per post', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->create();
    /** @var User $user */
    $user = User::factory()->create();

    PostReaction::factory()->create([
        'post_id' => $post->id,
        'user_id' => $user->id,
        'emoji' => ReactionEmoji::Clap,
    ]);

    expect(fn () => PostReaction::factory()->create([
        'post_id' => $post->id,
        'user_id' => $user->id,
        'emoji' => ReactionEmoji::Pray,
    ]))->toThrow(QueryException::class);
});

it('cascades post_reactions when their parent community_post is hard-deleted', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->create();
    PostReaction::factory()->create(['post_id' => $post->id]);

    $post->forceDelete();

    expect(PostReaction::query()->where('post_id', $post->id)->exists())->toBeFalse();
});

it('builds a PostComment with the expected default shape', function (): void {
    /** @var PostComment $comment */
    $comment = PostComment::factory()->create();

    expect($comment->id)->toBeInt()
        ->and($comment->post_id)->toBeInt()
        ->and($comment->user_id)->toBeInt()
        ->and($comment->body)->toBeString()
        ->and($comment->deleted_at)->toBeNull();
});

it('soft-deletes a comment and keeps the row recoverable', function (): void {
    /** @var PostComment $comment */
    $comment = PostComment::factory()->create();

    $comment->delete();

    expect(PostComment::query()->where('id', $comment->id)->exists())->toBeFalse()
        ->and(PostComment::query()->withTrashed()->where('id', $comment->id)->exists())->toBeTrue();
});

it('enforces UNIQUE(post_id, user_id) on post_rsvps — one RSVP per user per event', function (): void {
    /** @var CommunityPost $event */
    $event = CommunityPost::factory()->event()->create();
    /** @var User $user */
    $user = User::factory()->create();

    PostRsvp::factory()->create([
        'post_id' => $event->id,
        'user_id' => $user->id,
        'response' => RsvpResponse::Going,
    ]);

    expect(fn () => PostRsvp::factory()->create([
        'post_id' => $event->id,
        'user_id' => $user->id,
        'response' => RsvpResponse::Maybe,
    ]))->toThrow(QueryException::class);
});

it('casts community_posts.type and .visibility to the typed enums', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->event()->create([
        'visibility' => CommunityPostVisibility::Academy,
    ]);

    // Reload from DB to ensure the cast applies on read, not just on hydrate-from-attrs.
    $reloaded = CommunityPost::query()->findOrFail($post->id);

    expect($reloaded->type)->toBe(CommunityPostType::Event)
        ->and($reloaded->visibility)->toBe(CommunityPostVisibility::Academy);
});

it('casts post_reactions.emoji to the ReactionEmoji enum on read', function (): void {
    /** @var PostReaction $reaction */
    $reaction = PostReaction::factory()->pray()->create();

    $reloaded = PostReaction::query()->findOrFail($reaction->id);

    expect($reloaded->emoji)->toBe(ReactionEmoji::Pray);
});

it('casts post_rsvps.response to the RsvpResponse enum on read', function (): void {
    /** @var PostRsvp $rsvp */
    $rsvp = PostRsvp::factory()->maybe()->create();

    $reloaded = PostRsvp::query()->findOrFail($rsvp->id);

    expect($reloaded->response)->toBe(RsvpResponse::Maybe);
});

it('exposes the community_post relations: academy, createdBy, reactions, comments, rsvps', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->event()->create();

    PostReaction::factory()->count(3)->create(['post_id' => $post->id]);
    PostComment::factory()->count(2)->create(['post_id' => $post->id]);
    PostRsvp::factory()->count(1)->create(['post_id' => $post->id]);

    $reloaded = CommunityPost::query()
        ->with(['academy', 'createdBy', 'reactions', 'comments', 'rsvps'])
        ->findOrFail($post->id);

    expect($reloaded->academy)->not->toBeNull()
        ->and($reloaded->createdBy)->not->toBeNull()
        ->and($reloaded->reactions)->toHaveCount(3)
        ->and($reloaded->comments)->toHaveCount(2)
        ->and($reloaded->rsvps)->toHaveCount(1);
});
