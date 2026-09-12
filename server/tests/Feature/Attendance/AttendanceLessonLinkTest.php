<?php

declare(strict_types=1);

use App\Enums\AttendanceSource;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;

/**
 * A presence has to join its lesson, or the lesson never reads as held
 * (#1590).
 *
 * Coverage asks one question of a lesson: does any attendance row point at
 * it. The check-in screen asks a looser one — it shows a presence with no
 * lesson under whichever session you are looking at — and nothing used to
 * close the gap, so a tagged session full of people counted as nothing
 * taught.
 *
 * The gap is closed where the owner says which session they mean: tagging
 * topics on it. That is an explicit act on one lesson, so the day's
 * unattributed presences join it — but only when the day had one session to
 * be at, because otherwise nobody can say which.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;

    $this->date = '2026-09-09';
    // Carbon's `dayOfWeek` (0=Sun..6=Sat), which is what `academy_classes`
    // stores. ISO would agree here and differ only on a Sunday.
    $this->weekday = CarbonImmutable::parse($this->date)->dayOfWeek;

    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Standard Class',
        'weekday' => $this->weekday,
        'starts_at' => '19:00',
    ]);

    $this->mount = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount']);
    $this->sMount = SyllabusTopic::factory()->under($this->mount)->create(['name' => 'S-mount']);

    $this->athlete = Athlete::factory()->for($this->academy)->create();
});

/** A presence recorded with no idea which session it belonged to. */
function unattributedPresence(mixed $test, ?Athlete $athlete = null): AttendanceRecord
{
    return AttendanceRecord::factory()->create([
        'athlete_id' => ($athlete ?? $test->athlete)->id,
        'lesson_id' => null,
        'attended_on' => $test->date,
        'source' => AttendanceSource::Instructor,
    ]);
}

function tagTopics(mixed $test, array $topicIds): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $test->class->id,
        'held_on' => $test->date,
        'topic_ids' => $topicIds,
    ]);
}

it('adopts the day\'s unattributed presences when the session is tagged', function (): void {
    $record = unattributedPresence($this);

    tagTopics($this, [$this->sMount->id])->assertOk();

    $lesson = Lesson::query()->where('academy_class_id', $this->class->id)->firstOrFail();

    expect($record->fresh()->lesson_id)->toBe($lesson->id);
});

it('makes the tagged session read as held, which is the whole bug', function (): void {
    unattributedPresence($this);
    tagTopics($this, [$this->sMount->id])->assertOk();

    // Fixed instant, a week after the session and inside the same season, so
    // the report does not depend on the day the suite happens to run.
    $this->travelTo(CarbonImmutable::parse('2026-09-16'));

    $report = $this->actingAs($this->user)
        ->getJson('/api/v1/stats/syllabus/coverage')
        ->assertOk()
        ->json('data');

    // One held lesson naming one technique: thin, not covered — covered
    // still takes two. What must not happen is the zero it used to report.
    expect($report['totals']['thin'])->toBe(1)
        ->and($report['taught'])->toHaveCount(1)
        ->and($report['taught'][0]['name'])->toBe('S-mount');
});

it('leaves the presences alone when the day had more than one session', function (): void {
    AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Competition Class',
        'weekday' => $this->weekday,
        'starts_at' => '20:30',
    ]);

    $record = unattributedPresence($this);

    tagTopics($this, [$this->sMount->id])->assertOk();

    // Two sessions that evening and a presence that names neither: guessing
    // would be worse than leaving it unattributed.
    expect($record->fresh()->lesson_id)->toBeNull();
});

it('never steals a presence that already names another lesson', function (): void {
    $other = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Kids',
        'weekday' => $this->weekday,
        'starts_at' => '17:00',
    ]);
    $otherLesson = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $other->id,
        'held_on' => $this->date,
    ]);

    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => $otherLesson->id,
        'attended_on' => $this->date,
        'source' => AttendanceSource::Instructor,
    ]);

    tagTopics($this, [$this->sMount->id])->assertOk();

    expect($record->fresh()->lesson_id)->toBe($otherLesson->id);
});

it('adopts every athlete present that day, not just one', function (): void {
    $second = Athlete::factory()->for($this->academy)->create();
    $a = unattributedPresence($this);
    $b = unattributedPresence($this, $second);

    tagTopics($this, [$this->sMount->id])->assertOk();

    $lesson = Lesson::query()->where('academy_class_id', $this->class->id)->firstOrFail();

    expect($a->fresh()->lesson_id)->toBe($lesson->id)
        ->and($b->fresh()->lesson_id)->toBe($lesson->id);
});

it('does not reach into another academy', function (): void {
    $stranger = Athlete::factory()->create();
    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $stranger->id,
        'lesson_id' => null,
        'attended_on' => $this->date,
        'source' => AttendanceSource::Instructor,
    ]);

    tagTopics($this, [$this->sMount->id])->assertOk();

    expect($record->fresh()->lesson_id)->toBeNull();
});

it('leaves a presence from another day alone', function (): void {
    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => CarbonImmutable::parse($this->date)->subWeek()->toDateString(),
        'source' => AttendanceSource::Instructor,
    ]);

    tagTopics($this, [$this->sMount->id])->assertOk();

    expect($record->fresh()->lesson_id)->toBeNull();
});

it('attaches the lesson when an already-present athlete is marked again for a class', function (): void {
    $record = unattributedPresence($this);

    $this->actingAs($this->user)->postJson('/api/v1/attendance', [
        'athlete_ids' => [$this->athlete->id],
        'date' => $this->date,
        'academy_class_id' => $this->class->id,
    ])->assertSuccessful();

    $lesson = Lesson::query()->where('academy_class_id', $this->class->id)->firstOrFail();

    // Idempotent still means one row — it just also names the session now.
    expect($record->fresh()->lesson_id)->toBe($lesson->id)
        ->and(AttendanceRecord::query()->where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

// ─── The backfill, for data already on disk ──────────────────────────────────

/** The upgrade path: the one-shot migration, run against existing rows. */
function runBackfill(): void
{
    $migration = require database_path(
        'migrations/2026_09_12_170000_attach_unattributed_attendance_to_lessons.php',
    );

    $migration->up();
}

it('backfills a presence recorded before its lesson had any way to claim it', function (): void {
    $record = unattributedPresence($this);
    $lesson = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => $this->date,
    ]);

    runBackfill();

    expect($record->fresh()->lesson_id)->toBe($lesson->id);
});

it('backfills nothing on a day that had more than one session', function (): void {
    AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Competition Class',
        'weekday' => $this->weekday,
        'starts_at' => '20:30',
    ]);
    $record = unattributedPresence($this);
    Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => $this->date,
    ]);

    runBackfill();

    expect($record->fresh()->lesson_id)->toBeNull();
});

it('backfill leaves a presence that already names a lesson where it is', function (): void {
    $lesson = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => $this->date,
    ]);
    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => $lesson->id,
        'attended_on' => $this->date,
        'source' => AttendanceSource::Instructor,
    ]);

    runBackfill();

    expect($record->fresh()->lesson_id)->toBe($lesson->id);
});

it('backfill does not reach into another academy', function (): void {
    $stranger = Athlete::factory()->create();
    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $stranger->id,
        'lesson_id' => null,
        'attended_on' => $this->date,
        'source' => AttendanceSource::Instructor,
    ]);
    Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => $this->date,
    ]);

    runBackfill();

    expect($record->fresh()->lesson_id)->toBeNull();
});

// ─── The cases the first pass missed ─────────────────────────────────────────

it('still refuses a Sunday that had two sessions', function (): void {
    // The one day Carbon's `dayOfWeek` (0) and ISO (7) disagree. Reading the
    // column as ISO matched no row, so the guard counted zero classes and
    // failed **open** — on the day it was most needed. Every other weekday
    // agrees, which is why a Wednesday fixture could not see it.
    $sunday = '2026-09-13';
    expect(CarbonImmutable::parse($sunday)->dayOfWeek)->toBe(0)
        ->and(CarbonImmutable::parse($sunday)->dayOfWeekIso)->toBe(7);

    $morning = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Sunday open mat', 'weekday' => 0, 'starts_at' => '10:00',
    ]);
    AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Sunday competition', 'weekday' => 0, 'starts_at' => '17:00',
    ]);

    $record = AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => $sunday,
        'source' => AttendanceSource::Instructor,
    ]);

    $this->actingAs($this->user)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $morning->id,
        'held_on' => $sunday,
        'topic_ids' => [$this->sMount->id],
    ])->assertOk();

    expect($record->fresh()->lesson_id)->toBeNull();
});

it('refuses a date that already carries two lessons, whatever the timetable says now', function (): void {
    // The class was deleted or moved since that evening, so counting today's
    // timetable finds one session where there were two. `AcademyClass` is hard
    // deleted, so the lessons are the only surviving evidence.
    $gone = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Since deleted', 'weekday' => $this->weekday, 'starts_at' => '17:00',
    ]);
    Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $gone->id,
        'held_on' => $this->date,
    ]);
    $gone->delete();

    $record = unattributedPresence($this);

    tagTopics($this, [$this->sMount->id])->assertOk();

    expect($record->fresh()->lesson_id)->toBeNull();
});

it('adopts the presence of an athlete who has since left', function (): void {
    $departed = Athlete::factory()->for($this->academy)->create();
    $record = unattributedPresence($this, $departed);
    $departed->delete();

    tagTopics($this, [$this->sMount->id])->assertOk();

    $lesson = Lesson::query()->where('academy_class_id', $this->class->id)->firstOrFail();

    // They still trained that night and the lesson was still held. Dropping
    // them would make a real session read as emptier than it was.
    expect($record->fresh()->lesson_id)->toBe($lesson->id);
});

it('never gives one athlete two presences for one lesson across the two paths', function (): void {
    $second = Athlete::factory()->for($this->academy)->create();
    unattributedPresence($this);
    unattributedPresence($this, $second);

    // Path one: the owner checks the first athlete into the class.
    $this->actingAs($this->user)->postJson('/api/v1/attendance', [
        'athlete_ids' => [$this->athlete->id],
        'date' => $this->date,
        'academy_class_id' => $this->class->id,
    ])->assertSuccessful();

    // Path two: then tags the session, which sweeps up the rest of the day.
    tagTopics($this, [$this->sMount->id])->assertOk();

    $lesson = Lesson::query()->where('academy_class_id', $this->class->id)->firstOrFail();

    expect(AttendanceRecord::query()->where('lesson_id', $lesson->id)->count())->toBe(2)
        ->and(AttendanceRecord::query()->where('athlete_id', $this->athlete->id)->count())->toBe(1)
        ->and(AttendanceRecord::query()->where('athlete_id', $second->id)->count())->toBe(1);
});

it('backfill leaves an athlete who already names the lesson with a single presence', function (): void {
    $lesson = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => $this->date,
    ]);
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => $lesson->id,
        'attended_on' => $this->date,
        'source' => AttendanceSource::Instructor,
    ]);
    // An anomaly no current write path produces, but older versions might have.
    $stray = unattributedPresence($this);

    runBackfill();

    expect($stray->fresh()->lesson_id)->toBeNull()
        ->and(AttendanceRecord::query()->where('lesson_id', $lesson->id)->count())->toBe(1);
});
