<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Athlete;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Carbon::setTestNow('2026-09-15 14:30:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

it('leaves the date null on a brand-new athlete', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    // They were given a status, not moved to one. Null says "never changed
    // since the row was created" — the honest answer, and the one that keeps
    // a reader from mistaking an enrolment for a departure.
    expect($athlete->fresh()->status_changed_at)->toBeNull();
});

it('dates the row the day the status moves', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    $athlete->update(['status' => AthleteStatus::Inactive]);

    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-09-15');
});

it('does not re-date the row when something else is edited', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);
    $athlete->update(['status' => AthleteStatus::Inactive]);

    Carbon::setTestNow('2027-03-02 09:00:00');
    $athlete->update(['first_name' => 'Renamed']);

    // A measurement, not a touch timestamp. Re-stamping on an unrelated edit
    // would make it claim "changed today" about a status that has not moved
    // in six months.
    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-09-15');
});

it('does not re-date the row when the status is written with the value it already has', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);
    $athlete->update(['status' => AthleteStatus::Inactive]);

    Carbon::setTestNow('2027-03-02 09:00:00');
    $athlete->update(['status' => AthleteStatus::Inactive]);

    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-09-15');
});

it('re-dates the row when the athlete comes back', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);
    $athlete->update(['status' => AthleteStatus::Inactive]);

    Carbon::setTestNow('2027-03-02 09:00:00');
    $athlete->update(['status' => AthleteStatus::Active]);

    // It records the last change, not the departure. "When did they leave" is
    // a question about the current status, and coming back is a change too.
    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2027-03-02');
});

it('stamps the date through the API, not only through the model', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['status' => 'inactive'])
        ->assertOk()
        ->assertJsonPath('data.status_changed_at', '2026-09-15');
});

it('emits the date on the resource, null included', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    // Always present, so a client can tell "not changed" from "field missing".
    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.status_changed_at', null);
});

it('stores a date, not the hour of day', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);
    $athlete->update(['status' => AthleteStatus::Inactive]);

    $raw = (string) \Illuminate\Support\Facades\DB::table('athletes')
        ->where('id', $athlete->id)
        ->value('status_changed_at');

    // 14:30 on the clock, midnight in the column. The hour somebody was
    // marked inactive is noise, and storing it invites a screen that shows it.
    expect($raw)->toStartWith('2026-09-15')
        ->and($raw)->not->toContain('14:30');
});

// The backfill. It runs once, reads the audit log, and is never read again —
// so if it silently does nothing, nothing ever says so.

it('recovers the last status change from the audit log', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    \Illuminate\Support\Facades\DB::table('audit_entries')->insert([
        [
            'academy_id' => $user->academy->id,
            'action' => 'athlete.updated',
            'subject_type' => Athlete::class,
            'subject_id' => $athlete->id,
            'subject_label' => 'A B',
            'after' => json_encode(['status' => 'inactive']),
            'created_at' => '2025-11-04 08:12:00',
        ],
        [
            'academy_id' => $user->academy->id,
            'action' => 'athlete.updated',
            'subject_type' => Athlete::class,
            'subject_id' => $athlete->id,
            'subject_label' => 'A B',
            'after' => json_encode(['status' => 'active']),
            'created_at' => '2026-02-19 17:45:00',
        ],
    ]);
    \Illuminate\Support\Facades\DB::table('athletes')
        ->where('id', $athlete->id)
        ->update(['status_changed_at' => null]);

    statusChangedAtMigration()->up();

    // The most recent of the two, as a date.
    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-02-19');
});

it('does not date an athlete whose only audit rows are the creation and other edits', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    \Illuminate\Support\Facades\DB::table('audit_entries')->insert([
        [
            // `athlete.created` dumps the WHOLE row, status included. Matching
            // it would date every athlete's "status change" to their enrolment.
            'academy_id' => $user->academy->id,
            'action' => 'athlete.created',
            'subject_type' => Athlete::class,
            'subject_id' => $athlete->id,
            'subject_label' => 'A B',
            'after' => json_encode(['status' => 'active', 'belt' => 'white']),
            'created_at' => '2025-01-02 08:00:00',
        ],
        [
            'academy_id' => $user->academy->id,
            'action' => 'athlete.updated',
            'subject_type' => Athlete::class,
            'subject_id' => $athlete->id,
            'subject_label' => 'A B',
            'after' => json_encode(['stripes' => 2]),
            'created_at' => '2025-06-02 08:00:00',
        ],
    ]);
    \Illuminate\Support\Facades\DB::table('athletes')
        ->where('id', $athlete->id)
        ->update(['status_changed_at' => null]);

    statusChangedAtMigration()->up();

    expect($athlete->fresh()->status_changed_at)->toBeNull();
});

it('reads a status change filed under the belt-promotion verb', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);

    // One save that moved belt AND status is filed as `athlete.belt.promoted`.
    \Illuminate\Support\Facades\DB::table('audit_entries')->insert([
        'academy_id' => $user->academy->id,
        'action' => 'athlete.belt.promoted',
        'subject_type' => Athlete::class,
        'subject_id' => $athlete->id,
        'subject_label' => 'A B',
        'after' => json_encode(['belt' => 'blue', 'status' => 'inactive']),
        'created_at' => '2026-04-11 10:00:00',
    ]);
    \Illuminate\Support\Facades\DB::table('athletes')
        ->where('id', $athlete->id)
        ->update(['status_changed_at' => null]);

    statusChangedAtMigration()->up();

    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-04-11');
});

it('does not overwrite a date the observer has already written', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => AthleteStatus::Active]);
    $athlete->update(['status' => AthleteStatus::Inactive]);

    // Clear the trail this test's own save left behind, so the only matching
    // row is the stale one below. Without this the observer's audit entry
    // carries today's date too, the backfill writes the same value either
    // way, and the `whereNull` guard the test exists for cannot fail.
    \Illuminate\Support\Facades\DB::table('audit_entries')
        ->where('subject_type', Athlete::class)
        ->where('subject_id', $athlete->id)
        ->delete();

    \Illuminate\Support\Facades\DB::table('audit_entries')->insert([
        'academy_id' => $user->academy->id,
        'action' => 'athlete.updated',
        'subject_type' => Athlete::class,
        'subject_id' => $athlete->id,
        'subject_label' => 'A B',
        'after' => json_encode(['status' => 'inactive']),
        'created_at' => '2020-01-01 10:00:00',
    ]);

    statusChangedAtMigration()->up();

    // Re-running the migration on a live install must not walk the column
    // backwards to whatever the log happens to remember.
    expect($athlete->fresh()->status_changed_at?->toDateString())->toBe('2026-09-15');
});

function statusChangedAtMigration(): object
{
    // The column already exists under RefreshDatabase, so `up()` exercises
    // only the data half — which is the half that can silently do nothing.
    return require database_path(
        'migrations/2026_09_15_120000_add_status_changed_at_to_athletes_table.php',
    );
}
