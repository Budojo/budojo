<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;

/**
 * M9 PR-D server (#604) — feature tests for the community comments
 * surface (list / create / delete).
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

function commentAuthorAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    return $athleteUser;
}

// ── GET /api/v1/community/posts/{post}/comments ───────────────────────────

it('lists comments on a post in ascending-created-at order', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    $first = PostComment::factory()->for($this->post, 'post')->for($athlete)->create([
        'body' => 'first',
        'created_at' => now()->subMinutes(2),
    ]);
    $second = PostComment::factory()->for($this->post, 'post')->for($athlete)->create([
        'body' => 'second',
        'created_at' => now()->subMinute(),
    ]);
    $third = PostComment::factory()->for($this->post, 'post')->for($athlete)->create([
        'body' => 'third',
        'created_at' => now(),
    ]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/comments")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$first->id, $second->id, $third->id]);
});

it('excludes soft-deleted comments from the listing', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    $kept = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();
    $deleted = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();
    $deleted->delete();

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/comments")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$kept->id]);
});

it('includes the created_by identity flair shape on each comment', function (): void {
    $author = User::factory()->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'handle' => 'mariobjj',
    ]);
    PostComment::factory()->for($this->post, 'post')->for($author)->create();

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/comments")
        ->assertOk();

    expect($response->json('data.0.created_by'))->toMatchArray([
        'id' => $author->id,
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'handle' => 'mariobjj',
    ]);
});

it('rejects listing comments from a different academy with 403', function (): void {
    $otherOwner = userWithAcademy();

    $this->actingAs($otherOwner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/comments")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ── POST /api/v1/community/posts/{post}/comments ──────────────────────────

it('creates a comment with a 201 + the created resource envelope', function (): void {
    $athlete = commentAuthorAthlete($this->academy);

    $response = $this->actingAs($athlete)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", [
            'body' => 'Congrats Mario, well-earned blue belt!',
        ])
        ->assertCreated();

    expect($response->json('data.body'))->toBe('Congrats Mario, well-earned blue belt!')
        ->and($response->json('data.post_id'))->toBe($this->post->id)
        ->and($response->json('data.created_by.id'))->toBe($athlete->id);

    expect(PostComment::query()->where('post_id', $this->post->id)->count())->toBe(1);
});

it('trims whitespace around the body before storing', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", [
            'body' => "   Nice work   \n",
        ])
        ->assertCreated();

    expect($response->json('data.body'))->toBe('Nice work');
});

it('rejects an empty body with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => '   '])
        ->assertStatus(422);
});

it('rejects a body over 500 chars with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", [
            'body' => str_repeat('a', 501),
        ])
        ->assertStatus(422);
});

it('rejects creating a comment from a different academy with 403 envelope', function (): void {
    $otherOwner = userWithAcademy();

    $this->actingAs($otherOwner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'hi'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ── DELETE /api/v1/community/comments/{comment} ───────────────────────────

it('allows the author to delete their own comment', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();

    $this->actingAs($athlete)
        ->deleteJson("/api/v1/community/comments/{$comment->id}")
        ->assertNoContent();

    expect(PostComment::query()->where('id', $comment->id)->exists())->toBeFalse()
        ->and(PostComment::query()->withTrashed()->where('id', $comment->id)->exists())->toBeTrue();
});

it('allows the owner of the posts academy to delete any comment under it (moderation)', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/community/comments/{$comment->id}")
        ->assertNoContent();

    expect(PostComment::query()->where('id', $comment->id)->exists())->toBeFalse();
});

it('rejects a non-author, non-owner user trying to delete a comment — 403 envelope', function (): void {
    $authorAthlete = commentAuthorAthlete($this->academy);
    $otherAthlete = commentAuthorAthlete($this->academy);
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')->for($authorAthlete)->create();

    $this->actingAs($otherAthlete)
        ->deleteJson("/api/v1/community/comments/{$comment->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(PostComment::query()->where('id', $comment->id)->exists())->toBeTrue();
});

it('rejects a different-academy owner trying to delete with 403', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();

    $otherOwner = userWithAcademy();
    $this->actingAs($otherOwner)
        ->deleteJson("/api/v1/community/comments/{$comment->id}")
        ->assertStatus(403);
});

it('owner can still moderate-delete a comment whose parent post is soft-deleted', function (): void {
    $athlete = commentAuthorAthlete($this->academy);
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')->for($athlete)->create();

    // Owner soft-deletes the parent post first.
    $this->post->delete();

    // The comment still exists in the DB (cascade soft-delete is
    // not configured — comments survive their parent's soft-delete);
    // the owner should still be able to delete it (Copilot review
    // on PR #621 — pre-fix, the `belongsTo` returned null and the
    // endpoint 500ed).
    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/community/comments/{$comment->id}")
        ->assertNoContent();

    expect(PostComment::query()->where('id', $comment->id)->exists())->toBeFalse();
});

it('rejects unauthenticated requests with 401 on all three verbs', function (): void {
    $this->getJson("/api/v1/community/posts/{$this->post->id}/comments")->assertStatus(401);
    $this->postJson("/api/v1/community/posts/{$this->post->id}/comments", ['body' => 'x'])
        ->assertStatus(401);

    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($this->post, 'post')
        ->for(User::factory()->create())->create();
    $this->deleteJson("/api/v1/community/comments/{$comment->id}")->assertStatus(401);
});
