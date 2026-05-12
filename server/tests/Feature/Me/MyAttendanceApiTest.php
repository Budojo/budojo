<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;

/**
 * M7 PR-D slice 3 — feature tests for `GET /api/v1/me/attendance`.
 *
 * Returns the authenticated athlete's attendance records, optionally
 * filtered by `?from` and `?to` (YYYY-MM-DD). Owners get 404 (no
 * personal attendance history exists for the owner persona).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function authedAthleteUser(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

it('returns the athletes own attendance records in descending date order', function (): void {
    [$user, $athlete] = authedAthleteUser($this->academy);

    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-04-01']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-04-15']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-04-22']);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance')
        ->assertOk();

    $dates = collect($response->json('data'))->pluck('attended_on')->all();
    expect($dates)->toBe(['2026-04-22', '2026-04-15', '2026-04-01']);
});

it('filters by from + to window inclusively', function (): void {
    [$user, $athlete] = authedAthleteUser($this->academy);

    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-03-31']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-04-15']);
    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-05-01']);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?from=2026-04-01&to=2026-04-30')
        ->assertOk();

    $dates = collect($response->json('data'))->pluck('attended_on')->all();
    expect($dates)->toBe(['2026-04-15']);
});

it('only returns the callers own records (no cross-athlete leak)', function (): void {
    [$user, $athlete] = authedAthleteUser($this->academy);
    [$otherUser, $otherAthlete] = authedAthleteUser($this->academy);

    AttendanceRecord::factory()->for($athlete)->create(['attended_on' => '2026-04-10']);
    AttendanceRecord::factory()->for($otherAthlete)->create(['attended_on' => '2026-04-12']);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance')
        ->assertOk();

    $dates = collect($response->json('data'))->pluck('attended_on')->all();
    expect($dates)->toBe(['2026-04-10']);
});

it('returns 404 for an owner caller (no personal attendance history)', function (): void {
    $this->actingAs($this->owner)
        ->getJson('/api/v1/me/attendance')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('returns 404 with the canonical envelope for an athlete-role user with no linked athletes row', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'athlete']);

    $this->actingAs($orphan)
        ->getJson('/api/v1/me/attendance')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('rejects a malformed from / to with 422 (previously silently swallowed)', function (): void {
    [$user] = authedAthleteUser($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?from=not-a-date')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Invalid date range.']);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?to=2026-13-99')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Invalid date range.']);
});

it('rejects an invalid date range (from > to) with 422', function (): void {
    [$user] = authedAthleteUser($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?from=2026-05-01&to=2026-04-01')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Invalid date range.']);
});

it('rejects array-valued from / to query params with 422 (Copilot review on #636)', function (): void {
    // `?from[]=2026-01-01` arrives as an array on $request->query.
    // Previously the controller's `isInvalidDateInput()` returned
    // false for any non-string (the early return short-circuited
    // before validation), silently dropping the filter to the
    // unbounded window. Now any non-null, non-string value is
    // treated as invalid.
    [$user] = authedAthleteUser($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?from[]=2026-01-01')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Invalid date range.']);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance?to[]=2026-04-30')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Invalid date range.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/attendance')->assertStatus(401);
});
