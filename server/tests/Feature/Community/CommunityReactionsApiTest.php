<?php

declare(strict_types=1);

use App\Enums\ReactionEmoji;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostReaction;
use App\Models\User;

/**
 * M9 PR-C server (#603) — feature tests for the toggle-reaction endpoint
 * (`POST /api/v1/community/posts/{post}/react`).
 *
 * The endpoint is "one user, one reaction per post" — reacting with the
 * same emoji again removes it, reacting with a different emoji swaps in
 * place. The response always carries the resulting state so the SPA can
 * reconcile its optimistic update without a second fetch.
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

function authedAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    return $athleteUser;
}

// ── Owner reaction round-trip ─────────────────────────────────────────────

it('inserts a new reaction when the user has none yet', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'clap'])
        ->assertOk();

    expect($response->json('your_reaction'))->toBe('clap')
        ->and($response->json('counts.clap'))->toBe(1)
        ->and($response->json('counts.pray'))->toBe(0);

    expect(
        PostReaction::query()
        ->where('post_id', $this->post->id)
        ->where('user_id', $this->owner->id)
        ->where('emoji', ReactionEmoji::Clap)
        ->exists(),
    )->toBeTrue();
});

it('removes the reaction when the user re-reacts with the same emoji', function (): void {
    PostReaction::create([
        'post_id' => $this->post->id,
        'user_id' => $this->owner->id,
        'emoji' => ReactionEmoji::Clap,
    ]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'clap'])
        ->assertOk();

    expect($response->json('your_reaction'))->toBeNull()
        ->and($response->json('counts.clap'))->toBe(0)
        ->and($response->json('counts.pray'))->toBe(0);

    expect(
        PostReaction::query()
        ->where('post_id', $this->post->id)
        ->where('user_id', $this->owner->id)
        ->exists(),
    )->toBeFalse();
});

it('swaps the row in place when the user reacts with a different emoji', function (): void {
    PostReaction::create([
        'post_id' => $this->post->id,
        'user_id' => $this->owner->id,
        'emoji' => ReactionEmoji::Clap,
    ]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'pray'])
        ->assertOk();

    expect($response->json('your_reaction'))->toBe('pray')
        ->and($response->json('counts.clap'))->toBe(0)
        ->and($response->json('counts.pray'))->toBe(1);

    expect(PostReaction::query()->where('post_id', $this->post->id)->count())->toBe(1);
});

// ── Counts aggregate across users ─────────────────────────────────────────

it('aggregates counts across users on the same post', function (): void {
    $athleteA = authedAthlete($this->academy);
    $athleteB = authedAthlete($this->academy);

    PostReaction::create(['post_id' => $this->post->id, 'user_id' => $athleteA->id, 'emoji' => ReactionEmoji::Clap]);
    PostReaction::create(['post_id' => $this->post->id, 'user_id' => $athleteB->id, 'emoji' => ReactionEmoji::Pray]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'clap'])
        ->assertOk();

    expect($response->json('counts.clap'))->toBe(2)
        ->and($response->json('counts.pray'))->toBe(1);
});

// ── Athlete persona reads + writes the same surface ───────────────────────

it('allows an athlete in the same academy to react', function (): void {
    $athlete = authedAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'pray'])
        ->assertOk()
        ->assertJsonPath('your_reaction', 'pray');
});

// ── 403 / 422 / 401 boundaries ────────────────────────────────────────────

it('rejects a reaction from a user in a different academy with 403 envelope', function (): void {
    $otherOwner = userWithAcademy();

    $this->actingAs($otherOwner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'clap'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(PostReaction::query()->where('post_id', $this->post->id)->exists())->toBeFalse();
});

it('rejects an unknown emoji value with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'fire'])
        ->assertStatus(422);
});

it('rejects an unauthenticated request with 401', function (): void {
    $this->postJson("/api/v1/community/posts/{$this->post->id}/react", ['emoji' => 'clap'])
        ->assertStatus(401);
});
