<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\ReactionEmoji;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostReaction;
use App\Models\User;

/**
 * Post-v2.9.0 (#655) — feature tests for the reactions-list endpoint
 * (`GET /api/v1/community/posts/{post}/reactions`).
 *
 * Reads every reaction on a post with the reactor's identity flair
 * so the SPA can render a bottom-sheet / dialog showing "who reacted
 * with what". Same academy-scope gate as the toggle endpoint;
 * paginated 20/page; throttled via the shared `community-react`
 * limiter (60/min/user).
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

function listAthlete(Academy $academy, ?Belt $belt = null): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'user_id' => null,
        'belt' => $belt ?? Belt::White,
    ]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    return $athleteUser;
}

// ── Happy path ────────────────────────────────────────────────────────────

it('returns every reaction with identity flair when the caller owns the academy', function (): void {
    $athleteA = listAthlete($this->academy, Belt::Blue);
    $athleteB = listAthlete($this->academy, Belt::Purple);

    PostReaction::create(['post_id' => $this->post->id, 'user_id' => $athleteA->id, 'emoji' => ReactionEmoji::Clap]);
    PostReaction::create(['post_id' => $this->post->id, 'user_id' => $athleteB->id, 'emoji' => ReactionEmoji::Pray]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and($response->json('meta.total'))->toBe(2)
        ->and($response->json('meta.last_page'))->toBe(1)
        ->and($response->json('data.0.emoji'))->toBeIn(['clap', 'pray'])
        ->and($response->json('data.0.user.belt'))->toBeIn(['blue', 'purple']);
});

it('orders reactions by created_at desc then id desc for stable pagination', function (): void {
    // Reaction A created first → should sit at the BOTTOM (newest first).
    $athleteOld = listAthlete($this->academy);
    $athleteNew = listAthlete($this->academy);
    PostReaction::create([
        'post_id' => $this->post->id,
        'user_id' => $athleteOld->id,
        'emoji' => ReactionEmoji::Clap,
        'created_at' => now()->subHour(),
        'updated_at' => now()->subHour(),
    ]);
    PostReaction::create([
        'post_id' => $this->post->id,
        'user_id' => $athleteNew->id,
        'emoji' => ReactionEmoji::Pray,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertOk();

    expect($response->json('data.0.user.id'))->toBe($athleteNew->id)
        ->and($response->json('data.1.user.id'))->toBe($athleteOld->id);
});

it('paginates 20 per page and surfaces last_page when overflowing', function (): void {
    for ($i = 0; $i < 25; $i++) {
        $athlete = listAthlete($this->academy);
        PostReaction::create([
            'post_id' => $this->post->id,
            'user_id' => $athlete->id,
            'emoji' => ReactionEmoji::Clap,
        ]);
    }

    $page1 = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions?page=1")
        ->assertOk();

    expect($page1->json('data'))->toHaveCount(20)
        ->and($page1->json('meta.current_page'))->toBe(1)
        ->and($page1->json('meta.last_page'))->toBe(2)
        ->and($page1->json('meta.total'))->toBe(25);

    $page2 = $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions?page=2")
        ->assertOk();

    expect($page2->json('data'))->toHaveCount(5)
        ->and($page2->json('meta.current_page'))->toBe(2);
});

// ── Athlete read access in the same academy ───────────────────────────────

it('lets an athlete in the same academy read the reactions list', function (): void {
    $athleteCaller = listAthlete($this->academy);
    $athleteReactor = listAthlete($this->academy);
    PostReaction::create([
        'post_id' => $this->post->id,
        'user_id' => $athleteReactor->id,
        'emoji' => ReactionEmoji::Clap,
    ]);

    $this->actingAs($athleteCaller)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertOk()
        ->assertJsonPath('meta.total', 1);
});

// ── 401 / 403 boundaries ──────────────────────────────────────────────────

it('rejects an unauthenticated caller with 401', function (): void {
    $this->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertStatus(401);
});

it('rejects a caller from a different academy with 403', function (): void {
    $otherOwner = userWithAcademy();

    $this->actingAs($otherOwner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ── Rate limit (60 / minute / user, shared community-react limiter) ───────

it('returns 429 when the caller exceeds 60 reads per minute', function (): void {
    // The list endpoint shares the `community-react` limiter with the
    // toggle endpoint (60/min/user). A big-post "Load more" loop can
    // realistically fire several reads in succession (Copilot review
    // on #655 — adding throttle was one of the fix asks).
    for ($i = 0; $i < 60; $i++) {
        $this->actingAs($this->owner)
            ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
            ->assertOk();
    }

    $this->actingAs($this->owner)
        ->getJson("/api/v1/community/posts/{$this->post->id}/reactions")
        ->assertStatus(429);
});
