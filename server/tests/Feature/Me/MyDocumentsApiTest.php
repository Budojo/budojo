<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;

/**
 * M7 PR-D slice 5 — feature tests for `GET /api/v1/me/documents`.
 *
 * Read-only — returns the auth athlete's documents in descending-
 * created-at order, soft-deleted rows excluded. Owners and orphan
 * athlete-role users get 404.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function docAthleteUser(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

it("returns the athlete's own documents in descending-created-at order", function (): void {
    [$user, $athlete] = docAthleteUser($this->academy);

    $first = Document::factory()->for($athlete)->create(['created_at' => now()->subDays(3)]);
    $second = Document::factory()->for($athlete)->create(['created_at' => now()->subDays(2)]);
    $third = Document::factory()->for($athlete)->create(['created_at' => now()->subDay()]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/documents')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$third->id, $second->id, $first->id]);
});

it('excludes soft-deleted documents', function (): void {
    [$user, $athlete] = docAthleteUser($this->academy);

    $kept = Document::factory()->for($athlete)->create();
    $deleted = Document::factory()->for($athlete)->create();
    $deleted->delete();

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/documents')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$kept->id]);
});

it('isolates documents across athletes (no cross-athlete leak)', function (): void {
    [$user, $athlete] = docAthleteUser($this->academy);
    [, $otherAthlete] = docAthleteUser($this->academy);

    Document::factory()->for($athlete)->create();
    Document::factory()->for($otherAthlete)->create();

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/documents')
        ->assertOk();

    $athleteIds = collect($response->json('data'))->pluck('athlete_id')->unique()->all();
    expect($athleteIds)->toBe([$athlete->id]);
});

it('returns 404 with the canonical envelope for an owner caller', function (): void {
    $this->actingAs($this->owner)
        ->getJson('/api/v1/me/documents')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('returns 404 with the canonical envelope for an orphan athlete-role user', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'athlete']);

    $this->actingAs($orphan)
        ->getJson('/api/v1/me/documents')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/documents')->assertStatus(401);
});
