<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;

/**
 * M9 PR-B server (#612) — feature tests for the community feed API
 * + owner soft-delete endpoint.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

// ── GET /api/v1/community/feed ────────────────────────────────────────────

it('returns the academy feed for an authenticated owner in descending-created-at order', function (): void {
    // Three posts in this academy, plus one in a different academy (must NOT appear).
    $first = CommunityPost::factory()->for($this->academy)->event('First')->create(['created_at' => now()->subDays(3)]);
    $second = CommunityPost::factory()->for($this->academy)->event('Second')->create(['created_at' => now()->subDays(2)]);
    $third = CommunityPost::factory()->for($this->academy)->event('Third')->create(['created_at' => now()->subDay()]);

    // Stranger academy — should be invisible.
    $otherOwner = userWithAcademy();
    CommunityPost::factory()->for($otherOwner->academy)->create();

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$third->id, $second->id, $first->id]);
});

it('returns the academy feed for an authenticated athlete (same academy as owner)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::White,
        'user_id' => null,
    ]);

    // Link the athlete to a user with role=athlete.
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    $post = CommunityPost::factory()->for($this->academy)->event('Open mat')->create();

    $response = $this->actingAs($athleteUser)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$post->id]);
});

it('enforces tenant isolation — a user from academy A cannot see academy B posts', function (): void {
    CommunityPost::factory()->for($this->academy)->create();

    // Other owner, other academy, separate post.
    $otherOwner = userWithAcademy();
    $otherPost = CommunityPost::factory()->for($otherOwner->academy)->create();

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->not->toContain($otherPost->id);
});

it('paginates the feed at 20 per page', function (): void {
    CommunityPost::factory()->for($this->academy)->count(25)->create();

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed?page=1')
        ->assertOk();

    expect($response->json('data'))->toHaveCount(20)
        ->and($response->json('meta.total'))->toBe(25)
        ->and($response->json('meta.per_page'))->toBe(20);

    $page2 = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed?page=2')
        ->assertOk();

    expect($page2->json('data'))->toHaveCount(5);
});

it('returns an empty paginator (not 500) when the user has no academy', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'owner']);

    $response = $this->actingAs($orphan)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    expect($response->json('data'))->toBe([]);
});

it('includes the created_by user envelope shape on each item', function (): void {
    $author = User::factory()->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'handle' => 'mariobjj',
    ]);
    CommunityPost::factory()->for($this->academy)->create(['created_by_user_id' => $author->id]);

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    $created_by = $response->json('data.0.created_by');
    expect($created_by)
        ->toMatchArray([
            'id' => $author->id,
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'full_name' => 'Mario Rossi',
            'handle' => 'mariobjj',
        ]);
});

it('includes reactions_count / comments_count / rsvps_count zeroed for a fresh post', function (): void {
    CommunityPost::factory()->for($this->academy)->create();

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed')
        ->assertOk();

    expect($response->json('data.0.reactions_count'))->toBe(0)
        ->and($response->json('data.0.comments_count'))->toBe(0)
        ->and($response->json('data.0.rsvps_count'))->toBe(0);
});

it('rejects unauthenticated requests with 401', function (): void {
    $this->getJson('/api/v1/community/feed')->assertStatus(401);
});

// ── DELETE /api/v1/community/posts/{post} ─────────────────────────────────

it('owner soft-deletes a post in their academy — 204 + post disappears from the feed', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create();

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/community/posts/{$post->id}")
        ->assertNoContent();

    expect(CommunityPost::query()->where('id', $post->id)->exists())->toBeFalse()
        ->and(CommunityPost::query()->withTrashed()->where('id', $post->id)->exists())->toBeTrue();

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/community/feed')
        ->assertOk();
    expect($response->json('data'))->toBe([]);
});

it('athlete attempting to delete a post gets 403 with the canonical envelope', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['user_id' => null]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create();

    $this->actingAs($athleteUser)
        ->deleteJson("/api/v1/community/posts/{$post->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('owner cannot delete a post from a different academy — 403 envelope, post remains', function (): void {
    $otherOwner = userWithAcademy();
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($otherOwner->academy)->create();

    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/community/posts/{$post->id}")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(CommunityPost::query()->where('id', $post->id)->exists())->toBeTrue();
});

it('rejects unauthenticated DELETE with 401', function (): void {
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->create();

    $this->deleteJson("/api/v1/community/posts/{$post->id}")->assertStatus(401);
});
