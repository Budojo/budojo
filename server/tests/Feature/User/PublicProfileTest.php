<?php

declare(strict_types=1);

namespace Tests\Feature\User;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;

/**
 * Athlete public profile endpoint (#862, M9 social-profile epic slice A).
 *
 * Three gates that all collapse to 404 (no existence leak):
 *   1. Handle unknown.
 *   2. Target's profile_is_public = false.
 *   3. Cross-academy viewer.
 *
 * Happy path: same-academy peer with a public profile returns the projection
 * — first name, handle, belt, joined-at, promotions timeline.
 */

beforeEach(function () {
    /** @var \Tests\TestCase $this */
    $this->ownerUser = User::factory()->create();
    $this->academy = Academy::factory()->for($this->ownerUser, 'owner')->create();

    // Target athlete-user with a public profile.
    $this->targetUser = User::factory()->athlete()->create([
        'first_name' => 'Mario',
        'handle' => 'mariobjj',
        'profile_is_public' => true,
    ]);
    $this->targetAthlete = Athlete::factory()
        ->for($this->academy)
        ->state(['user_id' => $this->targetUser->id, 'first_name' => 'Mario'])
        ->create();
});

it('returns the public profile when same-academy viewer reads a public profile', function () {
    $response = $this->actingAs($this->ownerUser)
        ->getJson('/api/v1/users/mariobjj/profile')
        ->assertOk();

    expect($response->json('data.first_name'))->toBe('Mario')
        ->and($response->json('data.handle'))->toBe('mariobjj');
});

it('includes the promotions timeline ordered newest-first', function () {
    AthletePromotion::create([
        'athlete_id' => $this->targetAthlete->id,
        'kind' => 'belt',
        'from_belt' => 'white',
        'to_belt' => 'blue',
        'belt_at_event' => 'blue',
        'recorded_at' => '2026-01-15 10:00:00',
        'recorded_by_user_id' => $this->ownerUser->id,
    ]);
    AthletePromotion::create([
        'athlete_id' => $this->targetAthlete->id,
        'kind' => 'stripe',
        'from_stripes' => 0,
        'to_stripes' => 1,
        'belt_at_event' => 'blue',
        'recorded_at' => '2026-03-20 10:00:00',
        'recorded_by_user_id' => $this->ownerUser->id,
    ]);

    $response = $this->actingAs($this->ownerUser)
        ->getJson('/api/v1/users/mariobjj/profile')
        ->assertOk();

    $promotions = $response->json('data.promotions');
    expect($promotions)->toHaveCount(2)
        ->and($promotions[0]['kind'])->toBe('stripe')
        ->and($promotions[1]['kind'])->toBe('belt');
});

it('404s when the handle does not exist', function () {
    $this->actingAs($this->ownerUser)
        ->getJson('/api/v1/users/nonexistent/profile')
        ->assertNotFound();
});

it('404s when the target has profile_is_public = false (privacy opt-out)', function () {
    $this->targetUser->update(['profile_is_public' => false]);

    $this->actingAs($this->ownerUser)
        ->getJson('/api/v1/users/mariobjj/profile')
        ->assertNotFound();
});

it('404s when the viewer is in a different academy (cross-academy leak guard)', function () {
    $otherOwner = User::factory()->create();
    Academy::factory()->for($otherOwner, 'owner')->create();

    $this->actingAs($otherOwner)
        ->getJson('/api/v1/users/mariobjj/profile')
        ->assertNotFound();
});

it('401s when unauthenticated', function () {
    $this->getJson('/api/v1/users/mariobjj/profile')->assertUnauthorized();
});

it('404s when the handle is malformed (route regex catches before controller)', function () {
    $this->actingAs($this->ownerUser)
        ->getJson('/api/v1/users/INVALID/profile')
        ->assertNotFound();
});
