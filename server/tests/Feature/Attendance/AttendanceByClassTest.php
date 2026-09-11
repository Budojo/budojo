<?php

declare(strict_types=1);

use App\Enums\ClassKind;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use Carbon\Carbon;

/**
 * Checking in against a class (#1562).
 *
 * The attendance row used to be (athlete, day). With a timetable it becomes
 * (athlete, day, lesson): the lesson is created on the first tap, reused on
 * every tap after, and it is what "who was at the kids' class" is asked of.
 * An academy without a timetable is not touched by any of this.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    // A Monday evening, half an hour before the adults' class.
    Carbon::setTestNow(Carbon::parse('2026-09-14 18:30:00'));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->fundamentals = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Fundamentals', 'weekday' => 1, 'starts_at' => '19:00', 'kind' => ClassKind::Gi,
    ]);
    $this->openMat = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Open mat', 'weekday' => 1, 'starts_at' => '20:30', 'kind' => ClassKind::Both,
    ]);
    $this->mario = Athlete::factory()->for($this->academy)->create();
    $this->luigi = Athlete::factory()->for($this->academy)->create();
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function markInClass(mixed $test, AcademyClass $class, Athlete ...$athletes): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->postJson('/api/v1/attendance', [
        'date' => '2026-09-14',
        'athlete_ids' => array_map(static fn (Athlete $a): int => $a->id, $athletes),
        'academy_class_id' => $class->id,
    ]);
}

/** @return list<int> */
function presentIn(mixed $test, ?AcademyClass $class): array
{
    $query = $class === null ? '' : "&academy_class_id={$class->id}";

    return collect($test->actingAs($test->user)
        ->getJson("/api/v1/attendance?date=2026-09-14{$query}")
        ->assertOk()
        ->json('data'))
        ->pluck('athlete_id')
        ->sort()
        ->values()
        ->all();
}

// ─── POST with a class ───────────────────────────────────────────────────────

it('records the presence into the class lesson for the day, creating it on the first tap', function (): void {
    markInClass($this, $this->fundamentals, $this->mario, $this->luigi)
        ->assertCreated()
        ->assertJsonCount(2, 'data');

    $lesson = Lesson::sole();
    expect($lesson->academy_class_id)->toBe($this->fundamentals->id)
        ->and($lesson->academy_id)->toBe($this->academy->id)
        ->and($lesson->held_on->toDateString())->toBe('2026-09-14')
        // The snapshot: what the class was that evening.
        ->and($lesson->name)->toBe('Fundamentals')
        ->and($lesson->starts_at)->toBe('19:00')
        ->and($lesson->kind)->toBe(ClassKind::Gi);

    expect(AttendanceRecord::where('lesson_id', $lesson->id)->count())->toBe(2);
});

it('reuses the day lesson on every tap after the first', function (): void {
    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();
    markInClass($this, $this->fundamentals, $this->luigi)->assertCreated();

    expect(Lesson::count())->toBe(1)
        ->and(AttendanceRecord::whereNotNull('lesson_id')->count())->toBe(2);
});

it('says which lesson each row belongs to', function (): void {
    markInClass($this, $this->fundamentals, $this->mario)
        ->assertCreated()
        ->assertJsonPath('data.0.lesson_id', Lesson::sole()->id);
});

it('does not double-mark the same athlete in the same class', function (): void {
    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();
    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();

    expect(AttendanceRecord::where('athlete_id', $this->mario->id)->count())->toBe(1);
});

it('lets one athlete train in two classes on the same day', function (): void {
    // Fundamentals at 19:00, then stays for the open mat. Two sessions, two
    // rows — not a duplicate.
    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();
    markInClass($this, $this->openMat, $this->mario)->assertCreated();

    $lessonIds = AttendanceRecord::where('athlete_id', $this->mario->id)->pluck('lesson_id');
    expect($lessonIds)->toHaveCount(2)
        ->and($lessonIds->unique())->toHaveCount(2);
    expect(Lesson::count())->toBe(2);
});

it('changes nothing for an academy that sends no class', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/attendance', [
        'date' => '2026-09-14',
        'athlete_ids' => [$this->mario->id],
    ])->assertCreated()->assertJsonPath('data.0.lesson_id', null);

    expect(Lesson::count())->toBe(0);
});

it('refuses a class that belongs to another academy', function (): void {
    $foreign = AcademyClass::factory()->create(['weekday' => 1]);

    $this->actingAs($this->user)->postJson('/api/v1/attendance', [
        'date' => '2026-09-14',
        'athlete_ids' => [$this->mario->id],
        'academy_class_id' => $foreign->id,
    ])->assertForbidden();

    $this->actingAs($this->user)
        ->getJson("/api/v1/attendance?date=2026-09-14&academy_class_id={$foreign->id}")
        ->assertForbidden();

    expect(Lesson::count())->toBe(0)
        ->and(AttendanceRecord::count())->toBe(0);
});

it('rejects a class that does not exist', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/attendance', [
        'date' => '2026-09-14',
        'athlete_ids' => [$this->mario->id],
        'academy_class_id' => 999_999,
    ])->assertStatus(422)->assertJsonValidationErrors('academy_class_id');
});

// ─── GET with a class ────────────────────────────────────────────────────────

it('lists a class as its own lesson plus the presences of the day that have no class', function (): void {
    // Peach was marked before the timetable existed — a presence on the day.
    $peach = Athlete::factory()->for($this->academy)->create();
    AttendanceRecord::factory()->for($peach)->on('2026-09-14')->create();

    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();
    markInClass($this, $this->openMat, $this->luigi)->assertCreated();

    // Fundamentals: Mario, and Peach — who was there that day, class unknown.
    // Not Luigi, who was at the open mat.
    expect(presentIn($this, $this->fundamentals))->toBe(collect([$this->mario->id, $peach->id])->sort()->values()->all());
    expect(presentIn($this, $this->openMat))->toBe(collect([$this->luigi->id, $peach->id])->sort()->values()->all());
});

it('lists only the class-less presences when nobody has been checked into the class yet', function (): void {
    $peach = Athlete::factory()->for($this->academy)->create();
    AttendanceRecord::factory()->for($peach)->on('2026-09-14')->create();

    expect(presentIn($this, $this->fundamentals))->toBe([$peach->id]);

    // And asking did not conjure a lesson into existence.
    expect(Lesson::count())->toBe(0);
});

it('lists everyone on the day when no class is asked for', function (): void {
    $peach = Athlete::factory()->for($this->academy)->create();
    AttendanceRecord::factory()->for($peach)->on('2026-09-14')->create();
    markInClass($this, $this->fundamentals, $this->mario)->assertCreated();
    markInClass($this, $this->openMat, $this->luigi)->assertCreated();

    expect(presentIn($this, null))
        ->toBe(collect([$this->mario->id, $this->luigi->id, $peach->id])->sort()->values()->all());
});

it('treats a presence on the day as already present for every class of that day', function (): void {
    // Peach's row predates the timetable. Tapping her in Fundamentals must
    // not add a second row: she is already there.
    $peach = Athlete::factory()->for($this->academy)->create();
    AttendanceRecord::factory()->for($peach)->on('2026-09-14')->create();

    markInClass($this, $this->fundamentals, $peach)->assertCreated();

    expect(AttendanceRecord::where('athlete_id', $peach->id)->count())->toBe(1);
});
