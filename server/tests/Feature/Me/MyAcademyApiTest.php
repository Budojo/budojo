<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;

/**
 * M7 PR-D slice 2 (#618) — feature tests for `GET /api/v1/me/academy`.
 *
 * Role-agnostic surface: owners read their owned academy; athletes
 * read the academy on their linked athlete row. Returns 404 when no
 * academy is linked.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

it('returns the owned academy with the owner contact block for an owner caller', function (): void {
    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/me/academy')
        ->assertOk();

    expect($response->json('data.id'))->toBe($this->academy->id)
        ->and($response->json('data.name'))->toBe($this->academy->name)
        ->and($response->json('data.owner.first_name'))->toBe($this->owner->first_name)
        ->and($response->json('data.owner.last_name'))->toBe($this->owner->last_name)
        ->and($response->json('data.owner.email'))->toBe($this->owner->email);
});

it("returns the athlete's own academy with the owner contact block for an athlete caller", function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['user_id' => null]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    $response = $this->actingAs($athleteUser)
        ->getJson('/api/v1/me/academy')
        ->assertOk();

    expect($response->json('data.id'))->toBe($this->academy->id)
        ->and($response->json('data.owner.email'))->toBe($this->owner->email);
});

it('returns 404 for a user with no linked academy', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'owner']);

    $this->actingAs($orphan)
        ->getJson('/api/v1/me/academy')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No academy found.']);
});

it('returns 404 for an athlete-role user without an athletes row', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'athlete']);

    $this->actingAs($orphan)
        ->getJson('/api/v1/me/academy')
        ->assertStatus(404);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/academy')->assertStatus(401);
});
