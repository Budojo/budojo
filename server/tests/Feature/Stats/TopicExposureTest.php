<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Who has seen this technique (#1745).
 *
 * The athlete × technique matrix read one column at a time: the held lessons
 * that taught it this season, and the roster split three ways against them.
 * Every rule #1567 set for the athlete tab holds here, because this is the
 * same fact read from the other side: nobody misses what predates them, a
 * presence corrected away is not a presence, and a topic nobody has taught is
 * the academy's gap, never a list of people.
 */
beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-18'));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'weekday' => 3, 'starts_at' => '19:00',
    ]);

    $this->guard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);
    $this->armbar = SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Armbar']);

    $this->anna = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Anna', 'last_name' => 'Bianchi', 'joined_at' => '2026-09-01',
    ]);
    $this->marco = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Marco', 'last_name' => 'Rossi', 'joined_at' => '2026-09-01',
    ]);
});

/** A held lesson on `$date` naming `$topics`, with `$present` checked in. */
function exposureLesson(mixed $test, string $date, array $topics, array $present): Lesson
{
    $lesson = Lesson::factory()->forClass($test->class, $date)->create();
    $lesson->topics()->sync(array_map(static fn (SyllabusTopic $t): int => $t->id, $topics));

    foreach ($present as $who) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $who->id,
            'lesson_id' => $lesson->id,
            'attended_on' => $date,
        ]);
    }

    return $lesson;
}

function exposureOf(mixed $test, SyllabusTopic $topic, array $query = []): array
{
    $qs = http_build_query($query);

    return $test->actingAs($test->user)
        ->getJson("/api/v1/stats/syllabus/topics/{$topic->id}" . ($qs === '' ? '' : "?{$qs}"))
        ->assertOk()
        ->json('data');
}

/** The athlete rows of one state, by first name. */
function exposureNames(array $report, string $state): array
{
    return array_values(array_map(
        static fn (array $row): string => $row['first_name'],
        array_filter($report['athletes'], static fn (array $row): bool => $row['state'] === $state),
    ));
}

// ─── The three states ────────────────────────────────────────────────────────

it('splits the roster into seen, seen once and never there', function (): void {
    $giulia = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Giulia', 'last_name' => 'Verdi', 'joined_at' => '2026-09-01',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna, $this->marco]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-30', [$this->armbar], [$this->marco]);

    $report = exposureOf($this, $this->armbar);

    expect(exposureNames($report, 'seen'))->toBe(['Anna', 'Marco'])
        ->and(exposureNames($report, 'never'))->toBe(['Giulia'])
        ->and($report['totals'])->toBe(['lessons' => 3, 'seen' => 2, 'thin' => 0, 'never' => 1, 'unplaced' => 0]);

    $anna = collect($report['athletes'])->firstWhere('id', $this->anna->id);
    expect($anna['exposures'])->toBe(2)
        ->and($anna['last_seen_on'])->toBe('2026-09-23');
});

it('reads one lesson as seen once', function (): void {
    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna, $this->marco]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);

    $report = exposureOf($this, $this->armbar);

    expect(exposureNames($report, 'thin'))->toBe(['Marco'])
        ->and(collect($report['athletes'])->firstWhere('id', $this->marco->id)['exposures'])->toBe(1);
});

it('counts one evening once, however many topics it named', function (): void {
    // Tagged with the technique and its position: still one evening on the
    // mat. `COUNT(*)` over the join would read two.
    exposureLesson($this, '2026-09-16', [$this->armbar, $this->guard], [$this->anna]);

    $report = exposureOf($this, $this->armbar);

    expect(collect($report['athletes'])->firstWhere('id', $this->anna->id)['exposures'])->toBe(1)
        ->and($report['lessons'])->toHaveCount(1);
});

// ─── Nobody misses what predates them ────────────────────────────────────────

it('leaves out somebody who joined after the last lesson that taught it', function (): void {
    $late = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Luca', 'joined_at' => '2026-10-01',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);

    $report = exposureOf($this, $this->armbar);

    expect(collect($report['athletes'])->pluck('id')->all())->not->toContain($late->id)
        ->and($report['totals']['never'])->toBe(1);
});

it('keeps somebody who joined between two lessons as never there', function (): void {
    $midway = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Sara', 'joined_at' => '2026-09-20',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);

    expect(exposureNames(exposureOf($this, $this->armbar), 'never'))->toContain('Sara');
    expect($midway->id)->toBeInt();
});

it('keeps somebody who joined on the day of the last lesson — they could have been there', function (): void {
    Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Pietro', 'joined_at' => '2026-09-23',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);

    // The edge is inclusive: `joined_at > last` leaves out, `=` stays in.
    expect(exposureNames(exposureOf($this, $this->armbar), 'never'))->toContain('Pietro');
});

it('keeps somebody who went inactive on the day of the first lesson — they were still there', function (): void {
    Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Chiara',
        'joined_at' => '2025-01-01',
        'status' => AthleteStatus::Inactive,
        'status_changed_at' => '2026-09-16',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-23', [$this->armbar], [$this->anna]);

    // Inclusive on this edge too: left before the first lesson is out, left
    // that day is in.
    expect(exposureNames(exposureOf($this, $this->armbar), 'never'))->toContain('Chiara');
});

it('leaves out an athlete who had left before the first lesson', function (): void {
    $gone = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Paolo',
        'joined_at' => '2025-01-01',
        'status' => AthleteStatus::Inactive,
        'status_changed_at' => '2026-06-30',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);

    $ids = collect(exposureOf($this, $this->armbar)['athletes'])->pluck('id')->all();

    expect($ids)->not->toContain($gone->id);
});

it('keeps an inactive athlete whose departure has no date, and says they are inactive', function (): void {
    $undated = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Elena',
        'joined_at' => '2025-01-01',
        'status' => AthleteStatus::Inactive,
        'status_changed_at' => null,
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);

    $row = collect(exposureOf($this, $this->armbar)['athletes'])->firstWhere('id', $undated->id);

    expect($row)->not->toBeNull()
        ->and($row['state'])->toBe('never')
        ->and($row['status'])->toBe('inactive');
});

it('lists active athletes before inactive ones, each in register order', function (): void {
    Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Aldo', 'last_name' => 'Abate', 'joined_at' => '2025-01-01',
        'status' => AthleteStatus::Inactive, 'status_changed_at' => null,
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], []);
    // A lesson needs a body to be held; a third athlete stands in the room.
    $body = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Zeno', 'last_name' => 'Zanetti', 'joined_at' => '2026-09-01',
    ]);
    AttendanceRecord::factory()->create([
        'athlete_id' => $body->id,
        'lesson_id' => Lesson::query()->firstOrFail()->id,
        'attended_on' => '2026-09-16',
    ]);

    // Never there: Anna Bianchi, Marco Rossi (active), then Aldo Abate
    // (inactive) — alphabetical inside each group, never ranked.
    expect(exposureNames(exposureOf($this, $this->armbar), 'never'))->toBe(['Anna', 'Marco', 'Aldo']);
});

// ─── Held means somebody was there ───────────────────────────────────────────

it('ignores a lesson nobody was checked into', function (): void {
    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    // Planned, never confirmed: no row and no headcount.
    exposureLesson($this, '2026-09-23', [$this->armbar], []);

    $report = exposureOf($this, $this->armbar);

    expect($report['lessons'])->toHaveCount(1)
        ->and($report['lessons'][0]['held_on'])->toBe('2026-09-16')
        ->and($report['totals']['lessons'])->toBe(1);
});

it('does not count a presence that was corrected away', function (): void {
    $lesson = exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna, $this->marco]);

    AttendanceRecord::query()
        ->where('athlete_id', $this->marco->id)
        ->where('lesson_id', $lesson->id)
        ->delete();

    $report = exposureOf($this, $this->armbar);

    expect(exposureNames($report, 'never'))->toBe(['Marco'])
        ->and($report['lessons'][0]['headcount'])->toBe(1);
});

it('counts people in the room, not rows', function (): void {
    $lesson = exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna, $this->marco]);

    expect(exposureOf($this, $this->armbar)['lessons'][0])->toMatchArray([
        'id' => $lesson->id,
        'held_on' => '2026-09-16',
        'name' => $this->class->name,
        'headcount' => 2,
    ]);
});

it('lists the lessons oldest first', function (): void {
    exposureLesson($this, '2026-10-07', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);

    $dates = array_column(exposureOf($this, $this->armbar)['lessons'], 'held_on');

    expect($dates)->toBe(['2026-09-16', '2026-10-07']);
});

// ─── Not taught is not a list of people ──────────────────────────────────────

it('answers an honest empty for a technique nobody has taught', function (): void {
    $triangle = SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Triangle']);
    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);

    $report = exposureOf($this, $triangle);

    // Nobody has seen it because nobody has taught it: the academy's gap, and
    // a roster filed under "never" would put it on the people.
    expect($report['lessons'])->toBe([])
        ->and($report['athletes'])->toBe([])
        ->and($report['totals'])->toBe(['lessons' => 0, 'seen' => 0, 'thin' => 0, 'never' => 0, 'unplaced' => 0]);
});

// ─── A position is a different fact ──────────────────────────────────────────

it('drills a position down to the lessons that named the position itself', function (): void {
    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    exposureLesson($this, '2026-09-23', [$this->guard], [$this->marco]);

    $report = exposureOf($this, $this->guard);

    expect(array_column($report['lessons'], 'held_on'))->toBe(['2026-09-23'])
        ->and($report['topic'])->toMatchArray(['name' => 'Closed guard', 'parent_name' => null]);
});

// ─── What it cannot see ──────────────────────────────────────────────────────

it('never files a presence that names no lesson under never — it gets its own group', function (): void {
    $giulia = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Giulia', 'last_name' => 'Verdi', 'joined_at' => '2026-09-01',
    ]);

    exposureLesson($this, '2026-09-16', [$this->armbar], [$this->anna]);
    // Marco trained that day; the record cannot say at which lesson (#1590).
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->marco->id,
        'lesson_id' => null,
        'attended_on' => '2026-09-16',
    ]);
    // Giulia trained on a day the technique was not taught: that says nothing
    // about it, so she was never there for it.
    AttendanceRecord::factory()->create([
        'athlete_id' => $giulia->id,
        'lesson_id' => null,
        'attended_on' => '2026-10-01',
    ]);

    $report = exposureOf($this, $this->armbar);

    expect(exposureNames($report, 'unplaced'))->toBe(['Marco'])
        ->and(exposureNames($report, 'never'))->toBe(['Giulia'])
        ->and($report['totals'])->toMatchArray(['never' => 1, 'unplaced' => 1]);
});

// ─── The season ──────────────────────────────────────────────────────────────

it('answers for a previous season', function (): void {
    $early = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Pia', 'joined_at' => '2025-01-01',
    ]);
    exposureLesson($this, '2025-10-15', [$this->armbar], [$early]);

    expect(exposureOf($this, $this->armbar, ['seasons_back' => 1])['totals']['lessons'])->toBe(1)
        ->and(exposureOf($this, $this->armbar)['totals']['lessons'])->toBe(0);
});

it('describes the topic and the season it read', function (): void {
    $report = exposureOf($this, $this->armbar);

    expect($report['topic'])->toMatchArray([
        'id' => $this->armbar->id,
        'name' => 'Armbar',
        'parent_name' => 'Closed guard',
        'in_season' => true,
    ])->and($report['season'])->toHaveKeys(['start', 'end', 'label']);
});

it('carries how the topic is taught here, when the programme says (#1862)', function (): void {
    expect(exposureOf($this, $this->armbar)['topic'])->toMatchArray(['notes' => null, 'video_url' => null]);

    $this->armbar->update(['notes' => 'Start from the S-mount.', 'video_url' => 'https://vimeo.com/1']);

    expect(exposureOf($this, $this->armbar)['topic'])->toMatchArray([
        'notes' => 'Start from the S-mount.',
        'video_url' => 'https://vimeo.com/1',
    ]);
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

it("refuses another academy's topic", function (): void {
    $foreign = SyllabusTopic::factory()->for(Academy::factory()->create())->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/stats/syllabus/topics/{$foreign->id}")
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('refuses somebody with no standing in the academy', function (): void {
    $outsider = User::factory()->create(['active_academy_id' => $this->academy->id]);

    $this->actingAs($outsider)
        ->getJson("/api/v1/stats/syllabus/topics/{$this->armbar->id}")
        ->assertForbidden();
});

it('refuses to go further back than the report can answer', function (): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/stats/syllabus/topics/{$this->armbar->id}?seasons_back=99")
        ->assertStatus(422);
});

it('answers 404 for a topic that was taken out of the programme', function (): void {
    $this->armbar->delete();

    $this->actingAs($this->user)
        ->getJson("/api/v1/stats/syllabus/topics/{$this->armbar->id}")
        ->assertNotFound();
});
