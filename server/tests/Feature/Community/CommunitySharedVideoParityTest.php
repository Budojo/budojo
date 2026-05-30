<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\PostReaction;
use App\Models\User;

/**
 * Parity feature tests (#1156, epic #1153) — a `shared_video` is a
 * first-class community post: members react and comment on it, and an owner
 * moderates (soft-deletes) it exactly like an announcement or event. The
 * reaction / comment / delete endpoints are type-agnostic; these lock that
 * so a future change can't silently exclude the new post type.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($this->academy)->sharedVideo()->create();
    $this->post = $post;
});

function parityAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $u */
    $u = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $u->id]);

    return $u;
}

it('lets an academy member react to a shared_video post', function (): void {
    $athlete = parityAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson("/api/v1/community/posts/{$this->post->id}/reactions", ['emoji' => 'clap'])
        ->assertOk();

    expect(
        PostReaction::query()
            ->where('post_id', $this->post->id)
            ->where('user_id', $athlete->id)
            ->where('emoji', 'clap')
            ->exists(),
    )->toBeTrue();
});

it('lets an academy member comment on a shared_video post', function (): void {
    $athlete = parityAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson(
            "/api/v1/community/posts/{$this->post->id}/comments",
            ['body' => 'Drilling this tonight'],
        )
        ->assertCreated();

    expect(
        PostComment::query()
            ->where('post_id', $this->post->id)
            ->where('user_id', $athlete->id)
            ->where('body', 'Drilling this tonight')
            ->exists(),
    )->toBeTrue();
});

it('lets the owner moderate (soft-delete) a shared_video post', function (): void {
    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/community/posts/{$this->post->id}")
        ->assertNoContent();

    expect(CommunityPost::query()->where('id', $this->post->id)->exists())->toBeFalse()
        ->and(
            CommunityPost::query()->withTrashed()->where('id', $this->post->id)->exists(),
        )->toBeTrue();
});
