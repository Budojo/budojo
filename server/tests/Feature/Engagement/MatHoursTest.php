<?php

declare(strict_types=1);

use App\Actions\Engagement\BuildWeeklyRecapAction;
use App\Actions\Engagement\GetMonthlyLeaderboardAction;
use App\Actions\Lesson\MaterialiseLessonAction;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use Carbon\CarbonImmutable;

/**
 * Mat hours follow the timetable (#1591).
 *
 * They used to be `sessions × 1.5`, a flat constant no input could move: an
 * academy whose classes run an hour read 4.5h for three sessions, and would
 * have gone on doing so for every future session too. Each presence now
 * contributes the length of the lesson it names.
 *
 * The ninety minutes survive only as the fallback, for a presence that names
 * no lesson or a lesson whose class never set a duration.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->athlete = Athlete::factory()->for($this->academy)->create();

    // A Monday, and the week it opens.
    $this->monday = '2026-05-18';
});

/** A lesson of a given length, with the athlete present at it. */
function presenceAtLesson(mixed $test, string $date, ?int $minutes, ?Athlete $athlete = null): AttendanceRecord
{
    $class = AcademyClass::factory()->for($test->academy)->create([
        'weekday' => CarbonImmutable::parse($date)->dayOfWeek,
        'starts_at' => '19:00',
        'duration_minutes' => $minutes,
    ]);
    $lesson = Lesson::factory()->for($test->academy)->create([
        'academy_class_id' => $class->id,
        'held_on' => $date,
        'duration_minutes' => $minutes,
    ]);

    return AttendanceRecord::factory()->create([
        'athlete_id' => ($athlete ?? $test->athlete)->id,
        'lesson_id' => $lesson->id,
        'attended_on' => $date,
    ]);
}

// ─── The reported case ───────────────────────────────────────────────────────

it('reports three hours for three one-hour sessions, not four and a half', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    presenceAtLesson($this, '2026-05-20', 60);
    presenceAtLesson($this, '2026-05-22', 60);

    $recap = app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday));

    expect($recap->sessions)->toBe(3)
        ->and($recap->hours)->toBe(3.0);
});

it('adds up classes of different lengths', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    presenceAtLesson($this, '2026-05-20', 90);
    presenceAtLesson($this, '2026-05-22', 120);

    $recap = app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday));

    // 270 minutes. A flat constant could never produce this number.
    expect($recap->hours)->toBe(4.5)
        ->and($recap->sessions)->toBe(3);
});

it('counts one session but both hours when an athlete doubles up in an evening', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    presenceAtLesson($this, '2026-05-18', 90);

    $recap = app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday));

    // Sessions are distinct days on purpose, so somebody marked twice on one
    // date cannot outrank somebody who trained a different day. They did train
    // two and a half hours, though, and hours says so. The two numbers are
    // deliberately not proportional.
    expect($recap->sessions)->toBe(1)
        ->and($recap->hours)->toBe(2.5);
});

// ─── The fallback ────────────────────────────────────────────────────────────

it('falls back to ninety minutes for a presence that names no lesson', function (): void {
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => '2026-05-18',
    ]);

    $recap = app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday));

    expect($recap->hours)->toBe(1.5);
});

it('falls back when the lesson exists but its class never set a length', function (): void {
    presenceAtLesson($this, '2026-05-18', null);

    $recap = app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday));

    expect($recap->hours)->toBe(1.5);
});

it('mixes real durations and the fallback in one week', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => '2026-05-20',
    ]);

    // 60 + 90 minutes.
    expect(app(BuildWeeklyRecapAction::class)
        ->execute($this->athlete, CarbonImmutable::parse($this->monday))->hours)->toBe(2.5);
});

// ─── The leaderboard, the surface the bug was reported on ────────────────────

it('ranks the month on real durations', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    presenceAtLesson($this, '2026-05-20', 60);
    presenceAtLesson($this, '2026-05-22', 60);

    $rows = app(GetMonthlyLeaderboardAction::class)
        ->execute($this->academy, CarbonImmutable::parse('2026-05-01'));

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['sessions'])->toBe(3)
        ->and($rows[0]['hours'])->toBe(3.0);
});

it('keeps a lesson-less month on the fallback in the leaderboard too', function (): void {
    foreach (['2026-05-18', '2026-05-20', '2026-05-22'] as $date) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $this->athlete->id,
            'lesson_id' => null,
            'attended_on' => $date,
        ]);
    }

    $rows = app(GetMonthlyLeaderboardAction::class)
        ->execute($this->academy, CarbonImmutable::parse('2026-05-01'));

    expect($rows[0]['hours'])->toBe(4.5);
});

it('does not drop a lesson-less presence from the month', function (): void {
    presenceAtLesson($this, '2026-05-18', 60);
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => '2026-05-20',
    ]);

    // An inner join on lessons would quietly shrink the month to one session.
    $rows = app(GetMonthlyLeaderboardAction::class)
        ->execute($this->academy, CarbonImmutable::parse('2026-05-01'));

    expect($rows[0]['sessions'])->toBe(2)
        ->and($rows[0]['hours'])->toBe(2.5);
});

// ─── The snapshot ────────────────────────────────────────────────────────────

it('copies the class length onto the lesson when it is created', function (): void {
    $class = AcademyClass::factory()->for($this->academy)->create([
        'weekday' => 1, 'starts_at' => '19:00', 'duration_minutes' => 75,
    ]);

    $lesson = app(MaterialiseLessonAction::class)
        ->execute($class, CarbonImmutable::parse('2026-05-18'));

    expect($lesson->duration_minutes)->toBe(75);
});

it('keeps the length the lesson was created with when the class is edited later', function (): void {
    $class = AcademyClass::factory()->for($this->academy)->create([
        'weekday' => 1, 'starts_at' => '19:00', 'duration_minutes' => 60,
    ]);
    $lesson = app(MaterialiseLessonAction::class)
        ->execute($class, CarbonImmutable::parse('2026-05-18'));

    $class->update(['duration_minutes' => 120]);

    // The timetable is mutable and the past is not. Reading it live would
    // rewrite what March's hours were the day somebody edits a Monday.
    expect($lesson->fresh()->duration_minutes)->toBe(60);
});

it('backfills the length onto lessons that predate the column', function (): void {
    $class = AcademyClass::factory()->for($this->academy)->create([
        'weekday' => 1, 'starts_at' => '19:00', 'duration_minutes' => 45,
    ]);
    $lesson = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $class->id,
        'held_on' => '2026-05-18',
        'duration_minutes' => null,
    ]);

    $migration = require database_path(
        'migrations/2026_09_12_180000_add_duration_minutes_to_lessons_table.php',
    );
    // The column already exists under RefreshDatabase, so only the data half
    // is exercised here — which is the half that can silently do nothing.
    $migration->up();

    expect($lesson->fresh()->duration_minutes)->toBe(45);
});
