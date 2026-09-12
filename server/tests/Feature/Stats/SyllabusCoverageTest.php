<?php

declare(strict_types=1);

use App\Enums\TopicKind;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/**
 * Syllabus coverage across the season (#1565).
 *
 * The payoff screen, and the one place three earlier issues have to agree:
 * the programme is the denominator (#1563), the tags are the numerator
 * (#1564), and only a lesson somebody was actually checked into counts.
 *
 * Covered takes **two** lessons on purpose. Teaching a thing once in
 * September and calling it done is the self-deception this report exists to
 * prevent, so one is `thin`.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    // Mid-season, so there is room on both sides of the boundary.
    Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00'));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->class = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    $this->athlete = Athlete::factory()->for($this->academy)->create();

    $this->closedGuard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);
    $this->armbar = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Armbar']);
    $this->triangle = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Triangle']);

    Sanctum::actingAs($this->user);
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** A lesson on `$date` carrying `$topics`, held or merely planned. */
function lessonOn(mixed $test, string $date, array $topics, bool $held = true): Lesson
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

function coverage(mixed $test, array $query = []): array
{
    $qs = http_build_query($query);

    return $test->getJson('/api/v1/stats/syllabus/coverage' . ($qs === '' ? '' : "?{$qs}"))
        ->assertOk()
        ->json('data');
}

// ─── The three states ────────────────────────────────────────────────────────

it('calls nothing covered until it has been taught twice', function (): void {
    lessonOn($this, '2026-09-07', [$this->armbar]);

    $first = coverage($this);
    expect($first['totals'])->toMatchArray(['in_scope' => 2, 'covered' => 0, 'thin' => 1, 'missing' => 1]);

    lessonOn($this, '2026-09-14', [$this->armbar]);

    $second = coverage($this);
    expect($second['totals'])->toMatchArray(['in_scope' => 2, 'covered' => 1, 'thin' => 0, 'missing' => 1]);
});

it('counts two classes on one evening as two lessons — because that is what they are', function (): void {
    // Two classes on one evening, both tagged: the topic was taught once.
    $other = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    lessonOn($this, '2026-09-07', [$this->armbar]);
    $second = Lesson::factory()->forClass($other, '2026-09-07')->create();
    $second->topics()->sync([$this->armbar->id]);
    AttendanceRecord::create([
        'athlete_id' => $this->athlete->id, 'lesson_id' => $second->id, 'attended_on' => '2026-09-07',
    ]);

    // The rule counts lessons, and an academy that ran the topic in both the
    // fundamentals and the open mat taught it twice that evening.
    expect(coverage($this)['totals']['covered'])->toBe(1);
});

it('reports the percentage against the programme, and rounds it', function (): void {
    // Three techniques, one covered → 33%.
    SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Kimura']);
    lessonOn($this, '2026-09-07', [$this->armbar]);
    lessonOn($this, '2026-09-14', [$this->armbar]);

    expect(coverage($this)['totals'])->toMatchArray(['in_scope' => 3, 'covered' => 1, 'percentage' => 33]);
});

// ─── What does not count ─────────────────────────────────────────────────────

it('counts nothing from a lesson nobody was checked into', function (): void {
    lessonOn($this, '2026-09-07', [$this->armbar], held: false);
    lessonOn($this, '2026-09-14', [$this->armbar], held: false);

    $data = coverage($this);
    expect($data['totals'])->toMatchArray(['covered' => 0, 'thin' => 0, 'missing' => 2]);
    expect($data['taught'])->toBe([]);
});

it('leaves an out-of-season topic out of both halves of the fraction', function (): void {
    $this->triangle->update(['in_season' => false]);
    lessonOn($this, '2026-09-07', [$this->armbar]);
    lessonOn($this, '2026-09-14', [$this->armbar]);

    expect(coverage($this)['totals'])
        ->toMatchArray(['in_scope' => 1, 'covered' => 1, 'thin' => 0, 'missing' => 0, 'percentage' => 100]);
});

it('leaves a topic that has left the programme out entirely', function (): void {
    $this->triangle->delete();

    expect(coverage($this)['totals']['in_scope'])->toBe(1);
});

it('does not put positions in the denominator — a heading is not a thing to teach', function (): void {
    // Two techniques and one position in scope; the denominator is two.
    expect(coverage($this)['totals']['in_scope'])->toBe(2);
});

it('still reports a position worked as a whole, next to its bar', function (): void {
    lessonOn($this, '2026-09-07', [$this->closedGuard]);
    lessonOn($this, '2026-09-14', [$this->closedGuard]);

    $data = coverage($this);
    // "We worked closed guard" fills no technique...
    expect($data['totals'])->toMatchArray(['covered' => 0, 'missing' => 2]);
    // ...and is not thrown away either.
    expect($data['positions'][0])->toMatchArray(['name' => 'Closed guard', 'worked' => 2]);
});

// ─── The season window ───────────────────────────────────────────────────────

it('excludes a lesson from the day before the season started', function (): void {
    // The season runs 1 September 2026 → 31 August 2027.
    lessonOn($this, '2026-08-31', [$this->armbar]);
    lessonOn($this, '2026-09-01', [$this->armbar]);

    $data = coverage($this);
    expect($data['season'])->toMatchArray(['start' => '2026-09-01', 'end' => '2027-08-31']);
    // Only the September lesson is inside, so the armbar is thin, not covered.
    expect($data['totals'])->toMatchArray(['covered' => 0, 'thin' => 1]);
});

it('reads a previous season on request, and labels it', function (): void {
    lessonOn($this, '2025-10-06', [$this->armbar]);
    lessonOn($this, '2025-10-13', [$this->armbar]);

    $current = coverage($this);
    expect($current['totals']['covered'])->toBe(0);

    $previous = coverage($this, ['seasons_back' => 1]);
    expect($previous['season'])->toMatchArray(['start' => '2025-09-01', 'label' => '2025/26']);
    expect($previous['totals']['covered'])->toBe(1);
});

it('follows the academy own season boundary', function (): void {
    $this->academy->update(['season_start_month' => 1]);

    expect(coverage($this)['season'])
        ->toMatchArray(['start' => '2026-01-01', 'end' => '2026-12-31', 'label' => '2026']);
});

// ─── Gi and no-gi never mix ──────────────────────────────────────────────────

it('narrows the denominator with the filter, not only the numerator', function (): void {
    $this->armbar->update(['kind' => TopicKind::NoGi]);
    $this->triangle->update(['kind' => TopicKind::Gi]);
    $lapel = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Worm guard', 'kind' => TopicKind::Gi]);

    // Unfiltered: three techniques.
    expect(coverage($this)['totals']['in_scope'])->toBe(3);

    // No-gi: only the no-gi one. A gi topic is not counted against a no-gi
    // academy — that is the number that would be quietly wrong.
    $nogi = coverage($this, ['kind' => 'nogi']);
    expect($nogi['totals']['in_scope'])->toBe(1);
    expect($nogi['kind'])->toBe('nogi');

    // Gi: the two gi ones.
    expect(coverage($this, ['kind' => 'gi'])['totals']['in_scope'])->toBe(2);
    expect($lapel->fresh()?->kind)->toBe(TopicKind::Gi);
});

it('admits a both-kinds topic under either filter — that is what both means', function (): void {
    // Armbar stays `both` from the factory; make the other one gi.
    $this->triangle->update(['kind' => TopicKind::Gi]);

    expect(coverage($this, ['kind' => 'nogi'])['totals']['in_scope'])->toBe(1);
    expect(coverage($this, ['kind' => 'gi'])['totals']['in_scope'])->toBe(2);
});

it('refuses a filter value that is not a kind', function (): void {
    $this->getJson('/api/v1/stats/syllabus/coverage?kind=both')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['kind']);
});

// ─── The panels ──────────────────────────────────────────────────────────────

it('lists what is missing, named with the position it belongs to', function (): void {
    lessonOn($this, '2026-09-07', [$this->armbar]);

    $missing = coverage($this)['missing'];
    expect($missing)->toHaveCount(1);
    expect($missing[0])->toMatchArray(['name' => 'Triangle', 'parent_name' => 'Closed guard']);
});

it('answers "didn\'t I just do armbars?" with the most recent first', function (): void {
    lessonOn($this, '2026-09-07', [$this->triangle]);
    lessonOn($this, '2026-10-05', [$this->armbar]);

    $taught = coverage($this)['taught'];
    expect(array_column($taught, 'name'))->toBe(['Armbar', 'Triangle']);
    expect($taught[0])->toMatchArray(['last_taught_on' => '2026-10-05', 'lessons' => 1, 'state' => 'thin']);
});

it('grows the timeline on the day a topic became covered, not the day it was first taught', function (): void {
    lessonOn($this, '2026-09-07', [$this->armbar]);
    lessonOn($this, '2026-10-05', [$this->armbar]);

    $timeline = coverage($this)['timeline'];
    expect($timeline)->not->toBeEmpty();

    $beforeSecond = array_values(array_filter($timeline, static fn (array $p): bool => $p['on'] < '2026-10-05'));
    $afterSecond = array_values(array_filter($timeline, static fn (array $p): bool => $p['on'] >= '2026-10-05'));

    expect(array_column($beforeSecond, 'covered'))->each->toBe(0);
    expect($afterSecond[0]['covered'])->toBe(1);
});

it('stops the timeline at today rather than drawing a flat line into next summer', function (): void {
    lessonOn($this, '2026-09-07', [$this->armbar]);

    $timeline = coverage($this)['timeline'];
    $last = $timeline[count($timeline) - 1]['on'];
    expect($last)->toBeLessThanOrEqual(CarbonImmutable::today()->addWeek()->toDateString());
    expect($last)->toBeLessThan('2027-08-31');
});

// ─── Nothing to report ───────────────────────────────────────────────────────

it('answers an empty report for an academy with no programme, and never divides by zero', function (): void {
    $bare = userWithAcademy();
    Sanctum::actingAs($bare);

    $data = $this->getJson('/api/v1/stats/syllabus/coverage')->assertOk()->json('data');

    expect($data['totals'])->toMatchArray(['in_scope' => 0, 'covered' => 0, 'thin' => 0, 'missing' => 0, 'percentage' => 0]);
    expect($data['positions'])->toBe([]);
    expect($data['missing'])->toBe([]);
    expect($data['taught'])->toBe([]);
});

it('draws no bar for a position with nothing left in season', function (): void {
    $mount = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount', 'sort_order' => 1]);
    SyllabusTopic::factory()->under($mount)->create(['name' => 'Ezekiel', 'in_season' => false]);

    $names = array_column(coverage($this)['positions'], 'name');
    expect($names)->toBe(['Closed guard']);
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

it('never counts another academy lessons or topics', function (): void {
    $other = userWithAcademy();
    $theirTopic = SyllabusTopic::factory()->for($other->academy)->create();
    $theirClass = AcademyClass::factory()->for($other->academy)->create();
    $theirAthlete = Athlete::factory()->for($other->academy)->create();
    $lesson = Lesson::factory()->forClass($theirClass, '2026-09-07')->create();
    $lesson->topics()->sync([$theirTopic->id]);
    AttendanceRecord::create([
        'athlete_id' => $theirAthlete->id, 'lesson_id' => $lesson->id, 'attended_on' => '2026-09-07',
    ]);

    $data = coverage($this);
    expect($data['totals']['in_scope'])->toBe(2);
    expect($data['taught'])->toBe([]);
});
