<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * What the notes of the last evening that taught a technique said (#1862).
 *
 * Lesson notes are free text about the evening — "Marco's first day back" —
 * and are never parsed into topics (#1564). This does not parse them either:
 * it finds the latest **held** lesson that named the technique and carried
 * notes, and hands those notes back as that evening's, with its date and its
 * class, for the lesson sheet to show beside the technique.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->travelTo(CarbonImmutable::parse('2026-11-18'));

    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Fundamentals', 'starts_at' => '19:00',
    ]);
    $this->guard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);
    $this->armbar = SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Armbar']);
    $this->athlete = Athlete::factory()->for($this->academy)->create();
});

/** A lesson naming the topics, with notes; held unless told otherwise. */
function notedLesson(mixed $test, string $date, array $topics, ?string $notes, bool $held = true): Lesson
{
    $lesson = Lesson::factory()->for($test->academy)->create([
        'academy_class_id' => $test->class->id,
        'held_on' => $date,
        'name' => 'Fundamentals',
        'notes' => $notes,
    ]);
    $lesson->topics()->sync(collect($topics)->pluck('id')->all());

    if ($held) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $test->athlete->id,
            'lesson_id' => $lesson->id,
            'attended_on' => $date,
        ]);
    }

    return $lesson;
}

function lastNotes(mixed $test, int $topicId): mixed
{
    return $test->actingAs($test->user)
        ->getJson("/api/v1/lessons/last-notes?syllabus_topic_id={$topicId}")
        ->assertOk()
        ->json('data');
}

it('answers with the latest held lesson that taught it and carried notes', function (): void {
    notedLesson($this, '2026-10-07', [$this->armbar], 'Worked it from the S-mount.');
    notedLesson($this, '2026-11-04', [$this->armbar], 'Marco back after the injury; slow drills.');

    expect(lastNotes($this, $this->armbar->id))->toMatchArray([
        'held_on' => '2026-11-04',
        'name' => 'Fundamentals',
        'notes' => 'Marco back after the injury; slow drills.',
        'held' => true,
    ]);
});

it('skips a later lesson that taught it without notes', function (): void {
    notedLesson($this, '2026-10-07', [$this->armbar], 'Worked it from the S-mount.');
    notedLesson($this, '2026-11-04', [$this->armbar], null);
    notedLesson($this, '2026-11-11', [$this->armbar], '   ');

    expect(lastNotes($this, $this->armbar->id)['held_on'])->toBe('2026-10-07');
});

it('never answers with a plan — a lesson nobody was checked into', function (): void {
    notedLesson($this, '2026-10-07', [$this->armbar], 'Worked it from the S-mount.');
    // Next week's plan already carries a note; it did not happen yet.
    notedLesson($this, '2026-11-25', [$this->armbar], 'Plan: add the belly-down finish.', held: false);

    expect(lastNotes($this, $this->armbar->id)['held_on'])->toBe('2026-10-07');
});

it('ignores lessons that named something else', function (): void {
    $triangle = SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Triangle']);
    notedLesson($this, '2026-11-04', [$triangle], 'Triangle night.');

    expect(lastNotes($this, $this->armbar->id))->toBeNull();
});

it('answers null when no evening that taught it has notes', function (): void {
    notedLesson($this, '2026-11-04', [$this->armbar], null);

    expect(lastNotes($this, $this->armbar->id))->toBeNull();
});

it('refuses a topic of another academy', function (): void {
    $foreign = SyllabusTopic::factory()->for(Academy::factory()->create())->create(['name' => 'Altrove']);

    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons/last-notes?syllabus_topic_id={$foreign->id}")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['syllabus_topic_id']);
});

it('asks for a topic', function (): void {
    $this->actingAs($this->user)
        ->getJson('/api/v1/lessons/last-notes')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['syllabus_topic_id']);
});

it('refuses somebody with no standing in the academy', function (): void {
    $outsider = User::factory()->create(['active_academy_id' => $this->academy->id]);

    $this->actingAs($outsider)
        ->getJson("/api/v1/lessons/last-notes?syllabus_topic_id={$this->armbar->id}")
        ->assertForbidden();
});
