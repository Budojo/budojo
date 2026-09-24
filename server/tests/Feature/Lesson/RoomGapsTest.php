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
 * Tonight, for the people on the mat (#1860).
 *
 * The suggestions answer "what should the academy teach next?". This answers
 * the question an instructor asks once the check-in is done: of what the
 * academy has already taught this season, what did most of the people here
 * tonight miss? A technique taught twice counts as covered, and is still
 * worth teaching again when seven of tonight's nine never saw it.
 *
 * Every rule of the per-person reads holds (#1567, #1745): nobody misses what
 * predates them, a presence corrected away is not a presence, a presence that
 * names no lesson is never read as absence, and nothing ranks people.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;

    $this->travelTo(CarbonImmutable::parse('2026-11-18'));

    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Fundamentals',
        'weekday' => CarbonImmutable::parse('2026-11-18')->dayOfWeek,
        'starts_at' => '19:00',
        'kind' => 'gi',
    ]);

    $this->guard = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Closed guard', 'sort_order' => 1,
    ]);
    $this->armbar = SyllabusTopic::factory()->under($this->guard)->create([
        'name' => 'Armbar', 'sort_order' => 1,
    ]);
});

/** `$count` athletes on the roster since the season started, named in register order. */
function roomRoster(mixed $test, int $count, string $joined = '2026-09-01'): array
{
    $people = [];
    for ($i = 0; $i < $count; $i++) {
        $people[] = Athlete::factory()->for($test->academy)->create([
            'first_name' => 'Athlete',
            'last_name' => sprintf('R%02d', $i),
            'joined_at' => $joined,
        ]);
    }

    return $people;
}

/** A lesson of the class on `$date`, naming `$topics`, with `$present` checked in. */
function roomLesson(mixed $test, string $date, array $topics, array $present): Lesson
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

function roomGaps(mixed $test, string $heldOn = '2026-11-18', ?AcademyClass $class = null): array
{
    $id = ($class ?? $test->class)->id;

    return $test->actingAs($test->user)
        ->getJson("/api/v1/lessons/room-gaps?academy_class_id={$id}&held_on={$heldOn}")
        ->assertOk()
        ->json('data');
}

// ─── The question ────────────────────────────────────────────────────────────

it('names the technique most of tonight missed, and says how many', function (): void {
    $people = roomRoster($this, 9);

    // Taught twice — covered, by the suggestions' rule — to three people.
    roomLesson($this, '2026-10-07', [$this->armbar], array_slice($people, 0, 3));
    roomLesson($this, '2026-10-14', [$this->armbar], array_slice($people, 0, 3));
    // Tonight all nine are on the mat.
    roomLesson($this, '2026-11-18', [], $people);

    $report = roomGaps($this);

    expect($report['present'])->toBe(9)
        ->and($report['rows'])->toHaveCount(1)
        ->and($report['rows'][0])->toMatchArray([
            'id' => $this->armbar->id,
            'name' => 'Armbar',
            'parent_name' => 'Closed guard',
            'lessons' => 2,
            'last_taught_on' => '2026-10-14',
            'missed' => 6,
            'unattributed' => 0,
        ]);
});

it('lists who missed it, in register order, drawn as the roster draws them', function (): void {
    $people = roomRoster($this, 4);
    roomLesson($this, '2026-10-07', [$this->armbar], [$people[0]]);
    roomLesson($this, '2026-11-18', [], $people);

    $row = roomGaps($this)['rows'][0];

    expect(array_column($row['athletes'], 'last_name'))->toBe(['R01', 'R02', 'R03'])
        ->and($row['athletes'][0])->toHaveKeys([
            'id', 'first_name', 'last_name', 'belt', 'stripes', 'date_of_birth', 'photo_url', 'user_avatar_url',
        ]);
});

// ─── Nobody misses what predates them ────────────────────────────────────────

it('does not count somebody who joined after the last lesson that taught it', function (): void {
    $people = roomRoster($this, 4);
    $late = roomRoster($this, 2, '2026-11-01');

    roomLesson($this, '2026-10-07', [$this->armbar], [$people[0]]);
    roomLesson($this, '2026-11-18', [], [...$people, ...$late]);

    $row = roomGaps($this)['rows'][0];

    // Six on the mat; three of the original four missed it; the two who
    // joined in November could not have.
    expect($row['missed'])->toBe(3);
    expect(array_column($row['athletes'], 'id'))->not->toContain($late[0]->id);
});

it('does not count a presence that was corrected away as having been there', function (): void {
    $people = roomRoster($this, 4);
    $past = roomLesson($this, '2026-10-07', [$this->armbar], [$people[0], $people[1]]);
    roomLesson($this, '2026-11-18', [], $people);

    AttendanceRecord::query()
        ->where('athlete_id', $people[1]->id)
        ->where('lesson_id', $past->id)
        ->delete();

    expect(roomGaps($this)['rows'][0]['missed'])->toBe(3);
});

it('never reads a presence that names no lesson as an absence, and says how many', function (): void {
    $people = roomRoster($this, 4);
    roomLesson($this, '2026-10-07', [$this->armbar], [$people[0]]);
    // Trained that day; the record cannot say at which lesson (#1590).
    AttendanceRecord::factory()->create([
        'athlete_id' => $people[1]->id,
        'lesson_id' => null,
        'attended_on' => '2026-10-07',
    ]);
    roomLesson($this, '2026-11-18', [], $people);

    $row = roomGaps($this)['rows'][0];

    expect($row['missed'])->toBe(2)
        ->and($row['unattributed'])->toBe(1)
        ->and(array_column($row['athletes'], 'id'))->not->toContain($people[1]->id);
});

// ─── What it is not ──────────────────────────────────────────────────────────

it('never offers a technique the academy has not taught this season — that is rule one\'s job', function (): void {
    $people = roomRoster($this, 4);
    SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Triangle']);
    roomLesson($this, '2026-11-18', [], $people);

    expect(roomGaps($this)['rows'])->toBe([]);
});

it('never offers a no-gi technique to a gi class', function (): void {
    $people = roomRoster($this, 4);
    $heel = SyllabusTopic::factory()->under($this->guard)->create(['name' => 'Heel hook', 'kind' => 'nogi']);
    roomLesson($this, '2026-10-07', [$heel], [$people[0]]);
    roomLesson($this, '2026-11-18', [], $people);

    expect(roomGaps($this)['rows'])->toBe([]);
});

it('does not count last season, nor tonight itself', function (): void {
    $people = roomRoster($this, 4, '2025-01-01');
    roomLesson($this, '2026-06-10', [$this->armbar], [$people[0]]);
    // Tagged tonight: tonight is the lesson being planned, not one they missed.
    roomLesson($this, '2026-11-18', [$this->armbar], $people);

    expect(roomGaps($this)['rows'])->toBe([]);
});

it('stays quiet unless most of the room missed it', function (): void {
    $people = roomRoster($this, 9);
    // Five of nine were there; four missed it — not most of the room.
    roomLesson($this, '2026-10-07', [$this->armbar], array_slice($people, 0, 5));
    roomLesson($this, '2026-11-18', [], $people);

    expect(roomGaps($this)['rows'])->toBe([]);
});

it('says nothing for fewer than three on the mat', function (): void {
    $people = roomRoster($this, 2);
    roomLesson($this, '2026-10-07', [$this->armbar], []);
    // A lesson needs a body to be held.
    $body = roomRoster($this, 1)[0];
    AttendanceRecord::factory()->create([
        'athlete_id' => $body->id,
        'lesson_id' => Lesson::query()->firstOrFail()->id,
        'attended_on' => '2026-10-07',
    ]);
    roomLesson($this, '2026-11-18', [], $people);

    $report = roomGaps($this);

    expect($report['present'])->toBe(2)
        ->and($report['rows'])->toBe([]);
});

it('orders by how many missed it, then by what has waited longest, three at most', function (): void {
    $people = roomRoster($this, 10);
    $t = [];
    foreach (['Kimura', 'Omoplata', 'Hip bump', 'Scissor sweep'] as $i => $name) {
        $t[$name] = SyllabusTopic::factory()->under($this->guard)->create(['name' => $name, 'sort_order' => $i + 2]);
    }

    // Armbar: 8 missed. Kimura: 8 missed, taught earlier — waited longer.
    roomLesson($this, '2026-10-14', [$this->armbar], array_slice($people, 0, 2));
    roomLesson($this, '2026-10-07', [$t['Kimura']], array_slice($people, 0, 2));
    // Omoplata: 9 missed.
    roomLesson($this, '2026-10-21', [$t['Omoplata']], array_slice($people, 0, 1));
    // Hip bump and scissor sweep: 7 missed each, and neither makes the cut.
    roomLesson($this, '2026-10-28', [$t['Hip bump'], $t['Scissor sweep']], array_slice($people, 0, 3));
    roomLesson($this, '2026-11-18', [], $people);

    $names = array_column(roomGaps($this)['rows'], 'name');

    expect($names)->toBe(['Omoplata', 'Kimura', 'Armbar']);
});

it('answers nobody for a slot nobody is checked into yet', function (): void {
    $people = roomRoster($this, 4);
    roomLesson($this, '2026-10-07', [$this->armbar], [$people[0]]);

    // No lesson at all tonight, and then a planned one with nobody in it.
    expect(roomGaps($this))->toBe(['present' => 0, 'rows' => []]);

    roomLesson($this, '2026-11-18', [$this->armbar], []);
    expect(roomGaps($this))->toBe(['present' => 0, 'rows' => []]);
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

it("refuses another academy's class", function (): void {
    $foreign = AcademyClass::factory()->for(Academy::factory()->create())->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons/room-gaps?academy_class_id={$foreign->id}&held_on=2026-11-18")
        ->assertStatus(422);
});

it('refuses somebody with no standing in the academy', function (): void {
    $outsider = User::factory()->create(['active_academy_id' => $this->academy->id]);

    $this->actingAs($outsider)
        ->getJson("/api/v1/lessons/room-gaps?academy_class_id={$this->class->id}&held_on=2026-11-18")
        ->assertForbidden();
});
