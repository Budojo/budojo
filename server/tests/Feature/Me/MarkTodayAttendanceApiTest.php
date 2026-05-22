<?php

declare(strict_types=1);

use App\Enums\AttendanceSource;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;

/**
 * Self-mark feature tests — athletes register their own presence for
 * today's training day (#960). Mirrors the read-side
 * `MyAttendanceApiTest`; uses the same `authedAthleteUser` helper
 * shape via inline duplication (PEST doesn't reuse helpers across
 * files unless they live in `tests/Pest.php`).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    // Today (Carbon::today() in the controller) must be a configured
    // training day for the academy. Pin to today's dayOfWeek so the
    // tests don't depend on what wall-clock day they run on.
    $academy->update(['training_days' => [(int) Carbon::today()->dayOfWeek]]);
    $this->academy = $academy;
});

/**
 * @return array{User, Athlete}
 */
function authedSelfMarkAthlete(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

// ─── POST /api/v1/me/attendance/today ────────────────────────────────

it('marks the athlete present for today with source=self', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);

    $response = $this->actingAs($user)
        ->postJson('/api/v1/me/attendance/today')
        ->assertStatus(201)
        ->assertJsonPath('data.athlete_id', $athlete->id)
        ->assertJsonPath('data.attended_on', Carbon::today()->toDateString())
        ->assertJsonPath('data.source', 'self');

    $record = AttendanceRecord::query()
        ->where('athlete_id', $athlete->id)
        ->whereDate('attended_on', Carbon::today()->toDateString())
        ->firstOrFail();
    expect($record->source)->toBe(AttendanceSource::Self);
});

it('is idempotent — second POST returns 200 with the existing row', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);

    $this->actingAs($user)->postJson('/api/v1/me/attendance/today')->assertStatus(201);
    $response = $this->actingAs($user)->postJson('/api/v1/me/attendance/today')->assertStatus(200);

    // Only one active row should exist.
    expect(
        AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', Carbon::today()->toDateString())
            ->count(),
    )->toBe(1);
    expect($response->json('data.source'))->toBe('self');
});

it('preserves source=instructor when the instructor already marked the athlete today', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);
    AttendanceRecord::factory()
        ->for($athlete)
        ->create(['attended_on' => Carbon::today()->toDateString(), 'source' => AttendanceSource::Instructor]);

    $response = $this->actingAs($user)
        ->postJson('/api/v1/me/attendance/today')
        ->assertStatus(200);

    // The pre-existing instructor-marked row stays — the self-mark is
    // a no-op, NOT a source flip.
    expect($response->json('data.source'))->toBe('instructor');
});

it('returns 422 when today is not a configured training day', function (): void {
    [$user] = authedSelfMarkAthlete($this->academy);
    // Pick the day BEFORE today as the only training day → today is NOT.
    $this->academy->update(['training_days' => [(int) Carbon::yesterday()->dayOfWeek]]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/attendance/today')
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Not a training day today.']);
});

it('treats a null training_days as "no schedule configured" → 422', function (): void {
    [$user] = authedSelfMarkAthlete($this->academy);
    $this->academy->update(['training_days' => null]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/attendance/today')
        ->assertStatus(422);
});

it('returns 404 when the caller has no linked athlete row', function (): void {
    $owner = userWithAcademy();

    $this->actingAs($owner)
        ->postJson('/api/v1/me/attendance/today')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->postJson('/api/v1/me/attendance/today')->assertStatus(401);
});

// ─── DELETE /api/v1/me/attendance/today ─────────────────────────────

it('un-marks the athletes own self-mark for today', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);
    AttendanceRecord::factory()
        ->for($athlete)
        ->selfMarked()
        ->create(['attended_on' => Carbon::today()->toDateString()]);

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/attendance/today')
        ->assertStatus(204);

    expect(
        AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', Carbon::today()->toDateString())
            ->count(),
    )->toBe(0);
});

it('refuses to delete an instructor-marked row (only the instructor can revert their own mark)', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);
    AttendanceRecord::factory()
        ->for($athlete)
        ->create(['attended_on' => Carbon::today()->toDateString(), 'source' => AttendanceSource::Instructor]);

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/attendance/today')
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Cannot revert an instructor-marked attendance.']);

    expect(
        AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', Carbon::today()->toDateString())
            ->count(),
    )->toBe(1);
});

it('returns 204 (idempotent) when there is no row to delete', function (): void {
    [$user] = authedSelfMarkAthlete($this->academy);

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/attendance/today')
        ->assertStatus(204);
});

it('does NOT delete a self-mark from a previous day', function (): void {
    [$user, $athlete] = authedSelfMarkAthlete($this->academy);
    AttendanceRecord::factory()
        ->for($athlete)
        ->selfMarked()
        ->create(['attended_on' => Carbon::yesterday()->toDateString()]);

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/attendance/today')
        ->assertStatus(204);

    // Yesterday's row stays — the endpoint only touches today.
    expect(
        AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', Carbon::yesterday()->toDateString())
            ->count(),
    )->toBe(1);
});

it('DELETE returns 404 for callers without an athlete row', function (): void {
    $owner = userWithAcademy();
    $this->actingAs($owner)
        ->deleteJson('/api/v1/me/attendance/today')
        ->assertStatus(404);
});

it('DELETE rejects unauthenticated callers with 401', function (): void {
    $this->deleteJson('/api/v1/me/attendance/today')->assertStatus(401);
});
