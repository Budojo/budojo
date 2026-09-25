<?php

declare(strict_types=1);

use App\Enums\TrainingMode;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/**
 * The season map (#1858): each position, week by week.
 *
 * The coverage report answers how much; this answers when. It reads the same
 * programme by the same rules — in season, admitted by the filter, living — so
 * a row's weeks and the fraction printed at its end can never disagree about
 * what counts. What it adds is the difference between a lesson that was held,
 * one that is planned, and one that was planned and never checked into.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    // A Sunday, mid-season: its week began on Monday 9 November.
    Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00'));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->class = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    $this->athlete = Athlete::factory()->for($this->academy)->create();

    $this->closedGuard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard', 'sort_order' => 0]);
    $this->armbar = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Armbar']);
    $this->triangle = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Triangle']);

    Sanctum::actingAs($this->user);
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** A lesson on `$date` carrying `$topics`; checked into only when `$held`. */
function calendarLesson(mixed $test, string $date, array $topics, bool $held = true): Lesson
{
    $lesson = Lesson::factory()->forClass($test->class, $date)->create();
    $lesson->topics()->sync(array_map(static fn (SyllabusTopic $t): int => $t->id, $topics));

    if ($held) {
        AttendanceRecord::create([
            'athlete_id' => $test->athlete->id,
            'lesson_id' => $lesson->id,
            'attended_on' => $date,
        ]);
    }

    return $lesson;
}

function seasonCalendar(mixed $test, array $query = []): array
{
    $qs = http_build_query($query);

    return $test->getJson('/api/v1/stats/syllabus/calendar' . ($qs === '' ? '' : "?{$qs}"))
        ->assertOk()
        ->json('data');
}

/** The cells of one position, keyed by week. */
function cellsOf(array $calendar, SyllabusTopic $position): array
{
    foreach ($calendar['positions'] as $row) {
        if ($row['id'] === $position->id) {
            return collect($row['cells'])->keyBy('week')->all();
        }
    }

    return [];
}

// ─── Held, planned, never confirmed ──────────────────────────────────────────

it('counts two held lessons in one week on the position of the technique they taught', function (): void {
    calendarLesson($this, '2026-10-12', [$this->armbar]);
    calendarLesson($this, '2026-10-14', [$this->triangle]);

    expect(cellsOf(seasonCalendar($this), $this->closedGuard))->toBe([
        '2026-10-12' => ['week' => '2026-10-12', 'held' => 2, 'planned' => 0, 'unconfirmed' => 0],
    ]);
});

it('reads a lesson ahead of today with no check-in as planned, not held', function (): void {
    calendarLesson($this, '2026-11-18', [$this->armbar], held: false);

    $calendar = seasonCalendar($this);

    expect(cellsOf($calendar, $this->closedGuard))->toBe([
        '2026-11-16' => ['week' => '2026-11-16', 'held' => 0, 'planned' => 1, 'unconfirmed' => 0],
    ])
        ->and($calendar['lessons'][0]['state'])->toBe('planned');
});

it('reads a plan whose day has passed with no check-in as unconfirmed, not held', function (): void {
    calendarLesson($this, '2026-11-02', [$this->armbar], held: false);

    $calendar = seasonCalendar($this);

    expect(cellsOf($calendar, $this->closedGuard))->toBe([
        '2026-11-02' => ['week' => '2026-11-02', 'held' => 0, 'planned' => 0, 'unconfirmed' => 1],
    ])
        ->and($calendar['lessons'][0]['state'])->toBe('unconfirmed');
});

it('reads a lesson on today with no check-in yet as planned — the evening has not happened', function (): void {
    calendarLesson($this, '2026-11-15', [$this->armbar], held: false);

    expect(cellsOf(seasonCalendar($this), $this->closedGuard)['2026-11-09']['planned'])->toBe(1);
});

it('does not call a lesson held when its only presence was corrected away', function (): void {
    calendarLesson($this, '2026-10-05', [$this->armbar]);
    AttendanceRecord::query()->firstOrFail()->delete();

    expect(cellsOf(seasonCalendar($this), $this->closedGuard))->toBe([
        '2026-10-05' => ['week' => '2026-10-05', 'held' => 0, 'planned' => 0, 'unconfirmed' => 1],
    ]);
});

// ─── What a cell counts ──────────────────────────────────────────────────────

it('counts a lesson once for a position, however many of its techniques it taught', function (): void {
    calendarLesson($this, '2026-10-12', [$this->armbar, $this->triangle]);

    expect(cellsOf(seasonCalendar($this), $this->closedGuard)['2026-10-12']['held'])->toBe(1);
});

it('counts a lesson that named the position itself — "we worked closed guard"', function (): void {
    calendarLesson($this, '2026-10-12', [$this->closedGuard]);

    expect(cellsOf(seasonCalendar($this), $this->closedGuard)['2026-10-12']['held'])->toBe(1);
});

it('leaves an out-of-season technique out, as the fraction beside it does', function (): void {
    $this->triangle->update(['in_season' => false]);
    calendarLesson($this, '2026-10-12', [$this->triangle]);

    expect(cellsOf(seasonCalendar($this), $this->closedGuard))->toBe([]);
});

it('leaves a technique that has left the programme out', function (): void {
    calendarLesson($this, '2026-10-12', [$this->triangle]);
    $this->triangle->delete();

    expect(cellsOf(seasonCalendar($this), $this->closedGuard))->toBe([]);
});

it('narrows the weeks with the filter: a no-gi technique is not gi work', function (): void {
    $legs = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Leg entanglements', 'kind' => TrainingMode::NoGi]);
    $heelHook = SyllabusTopic::factory()->under($legs)->create(['name' => 'Heel hook', 'kind' => TrainingMode::NoGi]);
    calendarLesson($this, '2026-10-12', [$heelHook]);

    expect(cellsOf(seasonCalendar($this, ['kind' => 'gi']), $legs))->toBe([])
        ->and(cellsOf(seasonCalendar($this, ['kind' => 'nogi']), $legs))->toHaveKey('2026-10-12')
        ->and(cellsOf(seasonCalendar($this), $legs))->toHaveKey('2026-10-12');
});

it('refuses a filter value that is not one of the academy modes', function (): void {
    $this->getJson('/api/v1/stats/syllabus/calendar?kind=kata')->assertUnprocessable();
});

// ─── The window ──────────────────────────────────────────────────────────────

it('lists the Monday of every week in the season, the first one before the season opens', function (): void {
    $weeks = seasonCalendar($this)['weeks'];

    // 1 September 2026 is a Tuesday; 31 August 2027, the last day, is too.
    expect($weeks[0])->toBe('2026-08-31')
        ->and($weeks[count($weeks) - 1])->toBe('2027-08-30')
        ->and($weeks)->toHaveCount(53);
});

it('leaves out a lesson from before the season started', function (): void {
    calendarLesson($this, '2026-08-20', [$this->armbar]);

    $calendar = seasonCalendar($this);

    expect(cellsOf($calendar, $this->closedGuard))->toBe([])
        ->and($calendar['lessons'])->toBe([]);
});

it('reads a previous season on request, and labels it', function (): void {
    calendarLesson($this, '2025-10-06', [$this->armbar]);

    $calendar = seasonCalendar($this, ['seasons_back' => 1]);

    expect($calendar['season']['label'])->toBe('2025/26')
        ->and($calendar['weeks'][0])->toBe('2025-09-01')
        ->and(cellsOf($calendar, $this->closedGuard))->toHaveKey('2025-10-06');
});

// ─── The lessons themselves ──────────────────────────────────────────────────

it('carries each tagged lesson, the positions it counts for, and its topics', function (): void {
    $lesson = calendarLesson($this, '2026-11-18', [$this->armbar, $this->closedGuard], held: false);

    expect(seasonCalendar($this)['lessons'])->toBe([[
        'id' => $lesson->id,
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-11-18',
        'name' => $lesson->name,
        'starts_at' => $lesson->starts_at,
        'kind' => $lesson->kind->value,
        'state' => 'planned',
        'position_ids' => [$this->closedGuard->id],
        // The relation's own order: `sort_order`, then name.
        'topics' => [
            ['id' => $this->armbar->id, 'name' => 'Armbar', 'parent_id' => $this->closedGuard->id],
            ['id' => $this->closedGuard->id, 'name' => 'Closed guard', 'parent_id' => null],
        ],
    ]]);
});

it('lists a tagged lesson even when nothing on it counts under the filter', function (): void {
    $this->triangle->update(['in_season' => false]);
    calendarLesson($this, '2026-10-12', [$this->triangle]);

    expect(seasonCalendar($this)['lessons'][0]['position_ids'])->toBe([]);
});

it('leaves out a lesson with no topics — there is nothing on it to place', function (): void {
    calendarLesson($this, '2026-10-12', []);

    expect(seasonCalendar($this)['lessons'])->toBe([]);
});

it('lists the positions in programme order', function (): void {
    $mount = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount', 'sort_order' => 1]);
    $this->closedGuard->update(['sort_order' => 2]);

    $ids = array_column(seasonCalendar($this)['positions'], 'id');

    expect($ids)->toBe([$mount->id, $this->closedGuard->id]);
});

// ─── Boundaries ──────────────────────────────────────────────────────────────

it('never counts another academy lessons', function (): void {
    $other = userWithAcademy();
    $otherClass = AcademyClass::factory()->for($other->academy)->create();
    $otherGuard = SyllabusTopic::factory()->for($other->academy)->create();
    $otherLesson = Lesson::factory()->forClass($otherClass, '2026-10-12')->create();
    $otherLesson->topics()->sync([$otherGuard->id]);
    AttendanceRecord::create([
        'athlete_id' => Athlete::factory()->for($other->academy)->create()->id,
        'lesson_id' => $otherLesson->id,
        'attended_on' => '2026-10-12',
    ]);

    $calendar = seasonCalendar($this);

    expect($calendar['lessons'])->toBe([])
        ->and(array_column($calendar['positions'], 'id'))->toBe([$this->closedGuard->id]);
});

it('refuses a user with no academy with the stats envelope, and a guest', function (): void {
    Sanctum::actingAs(User::factory()->create());
    $this->getJson('/api/v1/stats/syllabus/calendar')
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);

    auth()->forgetGuards();
    $this->getJson('/api/v1/stats/syllabus/calendar')->assertUnauthorized();
});
