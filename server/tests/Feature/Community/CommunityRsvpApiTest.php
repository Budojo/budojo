<?php

declare(strict_types=1);

use App\Enums\CommunityPostType;
use App\Enums\RsvpResponse;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\PostRsvp;
use App\Models\User;

/**
 * M9 PR-E server (#605) — feature tests for the RSVP toggle
 * endpoint (`POST /api/v1/community/posts/{post}/rsvp`).
 *
 * Mirrors the reaction-toggle shape: one row per (post, user),
 * same-response toggles off, different-response swaps in place.
 * Only event-type posts accept RSVPs; non-event posts surface as
 * 422 with a `rsvp_not_event_post` error key.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;

    /** @var CommunityPost $event */
    $event = CommunityPost::factory()->for($this->academy)->event('Open mat')->create();
    $this->event = $event;
});

function rsvpAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return $user;
}

it('inserts a Going RSVP when the user has no row yet', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertOk();

    expect($response->json('your_rsvp'))->toBe('going')
        ->and($response->json('counts.going'))->toBe(1)
        ->and($response->json('counts.maybe'))->toBe(0);

    expect(PostRsvp::query()
        ->where('post_id', $this->event->id)
        ->where('user_id', $this->owner->id)
        ->where('response', RsvpResponse::Going)
        ->exists())->toBeTrue();
});

it('removes the RSVP when the user re-sends the same response', function (): void {
    PostRsvp::create([
        'post_id' => $this->event->id,
        'user_id' => $this->owner->id,
        'response' => RsvpResponse::Going,
    ]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertOk();

    expect($response->json('your_rsvp'))->toBeNull()
        ->and($response->json('counts.going'))->toBe(0);

    expect(PostRsvp::query()
        ->where('post_id', $this->event->id)
        ->where('user_id', $this->owner->id)
        ->exists())->toBeFalse();
});

it('swaps Going → Maybe in place when the user changes their mind', function (): void {
    PostRsvp::create([
        'post_id' => $this->event->id,
        'user_id' => $this->owner->id,
        'response' => RsvpResponse::Going,
    ]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'maybe'])
        ->assertOk();

    expect($response->json('your_rsvp'))->toBe('maybe')
        ->and($response->json('counts.going'))->toBe(0)
        ->and($response->json('counts.maybe'))->toBe(1);

    expect(PostRsvp::query()->where('post_id', $this->event->id)->count())->toBe(1);
});

it('aggregates counts across users on the same event', function (): void {
    $a = rsvpAthlete($this->academy);
    $b = rsvpAthlete($this->academy);
    PostRsvp::create(['post_id' => $this->event->id, 'user_id' => $a->id, 'response' => RsvpResponse::Going]);
    PostRsvp::create(['post_id' => $this->event->id, 'user_id' => $b->id, 'response' => RsvpResponse::Maybe]);

    $response = $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertOk();

    expect($response->json('counts.going'))->toBe(2)
        ->and($response->json('counts.maybe'))->toBe(1);
});

it('allows an athlete in the same academy to RSVP', function (): void {
    $athlete = rsvpAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertOk()
        ->assertJsonPath('your_rsvp', 'going');
});

it('rejects RSVP from a user in a different academy with 403 envelope', function (): void {
    $otherOwner = userWithAcademy();

    $this->actingAs($otherOwner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(PostRsvp::query()->where('post_id', $this->event->id)->exists())->toBeFalse();
});

it('rejects RSVP on a non-event post with 422', function (): void {
    /** @var CommunityPost $announcement */
    $announcement = CommunityPost::factory()->for($this->academy)->create([
        'type' => CommunityPostType::OwnerAnnouncement,
    ]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$announcement->id}/rsvp", ['response' => 'going'])
        ->assertStatus(422)
        ->assertJsonPath('errors.response.0', 'rsvp_not_event_post');
});

it('rejects an unknown response value with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'declined'])
        ->assertStatus(422);
});

it('rejects an unauthenticated request with 401', function (): void {
    $this->postJson("/api/v1/community/posts/{$this->event->id}/rsvp", ['response' => 'going'])
        ->assertStatus(401);
});
