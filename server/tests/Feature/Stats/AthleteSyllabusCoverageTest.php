<?php

declare(strict_types=1);

use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * What this athlete has seen, and what they missed (#1567).
 *
 * The screen has one job it must not get wrong: it is about a person, so it
 * reads as "here is what to catch up on" and never as a ranking. Two rules
 * carry that. The denominator is what the academy actually **taught**, not the
 * whole syllabus, so nobody wears a low number for a decision about the
 * programme. And everything is scoped to on or after `joined_at`, because a
 * white belt who walked in last month did not miss October.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;

    $this->travelTo(CarbonImmutable::parse('2026-11-18'));

    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'weekday' => 3, 'starts_at' => '19:00',
    ]);

    $this->guard = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Closed guard', 'sort_order' => 1,
    ]);

    $this->athlete = Athlete::factory()->for($this->academy)->create([
        'joined_at' => '2026-09-01',
    ]);
});

function coveredTechnique(mixed $test, string $name, int $order = 0): SyllabusTopic
{
    return SyllabusTopic::factory()->under($test->guard)->create([
        'name' => $name, 'sort_order' => $order,
    ]);
}

/** A held lesson naming topics, with the given athletes present at it. */
function lessonWith(mixed $test, string $date, array $topics, array $present): Lesson
{
    $lesson = Lesson::factory()->for($test->academy)->create([
        'academy_class_id' => $test->class->id,
        'held_on' => $date,
    ]);
    $lesson->topics()->sync(collect($topics)->pluck('id')->all());

    // A lesson needs somebody in it to count as held at all, so an "athlete
    // was absent" case still needs a body in the room.
    $bodies = $present === [] ? [Athlete::factory()->for($test->academy)->create()] : $present;
    foreach ($bodies as $who) {
        AttendanceRecord::factory()->create([
            'athlete_id' => $who->id,
            'lesson_id' => $lesson->id,
            'attended_on' => $date,
        ]);
    }

    return $lesson;
}

function athleteCoverage(mixed $test, ?Athlete $athlete = null, array $query = []): array
{
    $id = ($athlete ?? $test->athlete)->id;
    $qs = http_build_query($query);

    return $test->actingAs($test->user)
        ->getJson("/api/v1/athletes/{$id}/syllabus-coverage" . ($qs === '' ? '' : "?{$qs}"))
        ->assertOk()
        ->json('data');
}

// ─── The four states ─────────────────────────────────────────────────────────

it('separates what they missed from what nobody taught', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $triangle = coveredTechnique($this, 'Triangle', 2);
    coveredTechnique($this, 'Omoplata', 3);

    lessonWith($this, '2026-09-16', [$armbar], [$this->athlete]);
    lessonWith($this, '2026-09-23', [$armbar], [$this->athlete]);
    lessonWith($this, '2026-09-30', [$triangle], []);

    $report = athleteCoverage($this);

    // Omoplata is not their gap: the academy never taught it. Putting it in
    // the same bucket as Triangle would blame a person for a decision about
    // the programme.
    expect($report['totals'])->toMatchArray([
        'taught_by_academy' => 2,
        'seen' => 1,
        'thin' => 0,
        'missed' => 1,
        'percentage' => 50,
        'not_taught_yet' => 1,
    ]);
    expect($report['missed'])->toHaveCount(1)
        ->and($report['missed'][0]['name'])->toBe('Triangle')
        ->and($report['missed'][0]['parent_name'])->toBe('Closed guard');
});

it('calls one attendance thin, the way the academy view does', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);

    lessonWith($this, '2026-09-16', [$armbar], [$this->athlete]);
    lessonWith($this, '2026-09-23', [$armbar], []);

    $report = athleteCoverage($this);

    // They saw it once out of two evenings: not missed, not covered.
    expect($report['totals'])->toMatchArray([
        'taught_by_academy' => 1, 'seen' => 0, 'thin' => 1, 'missed' => 0,
    ]);
});

it('says how many chances they had at each thing they missed', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);

    lessonWith($this, '2026-09-16', [$armbar], []);
    lessonWith($this, '2026-09-23', [$armbar], []);
    lessonWith($this, '2026-09-30', [$armbar], []);

    // "You were out that night" and "you keep missing this one" are different
    // conversations.
    expect(athleteCoverage($this)['missed'][0]['taught_times'])->toBe(3);
});

// ─── Nobody misses what happened before they walked in ───────────────────────

it('ignores everything taught before the athlete joined', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $late = Athlete::factory()->for($this->academy)->create(['joined_at' => '2026-11-01']);

    lessonWith($this, '2026-09-16', [$armbar], []);
    lessonWith($this, '2026-09-23', [$armbar], []);

    $report = athleteCoverage($this, $late);

    // Those evenings are not a gap in this person, they are a gap in the
    // calendar. The topic falls back to "not taught yet" for them.
    expect($report['totals'])->toMatchArray([
        'taught_by_academy' => 0, 'missed' => 0, 'percentage' => 0, 'not_taught_yet' => 1,
    ]);
    expect($report['joined_on'])->toBe('2026-11-01');
});

it('counts a lesson on the joining day itself', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $sameDay = Athlete::factory()->for($this->academy)->create(['joined_at' => '2026-09-16']);

    lessonWith($this, '2026-09-16', [$armbar], [$sameDay]);

    expect(athleteCoverage($this, $sameDay)['totals'])
        ->toMatchArray(['taught_by_academy' => 1, 'thin' => 1]);
});

// ─── The boundaries it shares with the academy view ──────────────────────────

it('ignores a lesson nobody was checked into', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);

    $planned = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-09-16',
    ]);
    $planned->topics()->sync([$armbar->id]);

    expect(athleteCoverage($this)['totals'])
        ->toMatchArray(['taught_by_academy' => 0, 'not_taught_yet' => 1]);
});

it('ignores a topic that is out of season', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $armbar->update(['in_season' => false]);

    lessonWith($this, '2026-09-16', [$armbar], [$this->athlete]);

    expect(athleteCoverage($this)['totals'])->toMatchArray(['taught_by_academy' => 0]);
});

it('never counts a position, only what is taught inside one', function (): void {
    coveredTechnique($this, 'Armbar', 1);
    lessonWith($this, '2026-09-16', [$this->guard], [$this->athlete]);

    // Tagging "closed guard" is a real answer for the academy view, but it is
    // not a technique this athlete has or has not seen.
    expect(athleteCoverage($this)['totals'])
        ->toMatchArray(['taught_by_academy' => 0, 'not_taught_yet' => 1]);
});

it('does not count a presence at a different lesson that day', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $other = AcademyClass::factory()->for($this->academy)->create(['weekday' => 3, 'starts_at' => '17:00']);

    $theirs = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $other->id,
        'held_on' => '2026-09-16',
    ]);
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => $theirs->id,
        'attended_on' => '2026-09-16',
    ]);

    lessonWith($this, '2026-09-16', [$armbar], []);

    // They were in the building. They were not in that room.
    expect(athleteCoverage($this)['totals'])
        ->toMatchArray(['taught_by_academy' => 1, 'seen' => 0, 'missed' => 1]);
});

// ─── Honest about what it cannot see ─────────────────────────────────────────

it('reports presences it cannot attribute rather than counting them as absence', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    lessonWith($this, '2026-09-16', [$armbar], []);

    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => null,
        'attended_on' => '2026-09-16',
    ]);

    $report = athleteCoverage($this);

    // The row says they trained. It cannot say what they trained, and a screen
    // that silently called that absence would report a gap that is really a
    // missing record.
    expect($report['unattributed_presences'])->toBe(1)
        ->and($report['totals']['missed'])->toBe(1);
});

it('does not count a presence that was corrected away', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    // Somebody else stays in the room, or removing this presence would leave
    // a lesson nobody attended — which is correctly not held at all, and would
    // test a different rule than the one named above.
    $classmate = Athlete::factory()->for($this->academy)->create(['joined_at' => '2026-09-01']);
    $lesson = lessonWith($this, '2026-09-16', [$armbar], [$this->athlete, $classmate]);

    AttendanceRecord::query()
        ->where('athlete_id', $this->athlete->id)
        ->where('lesson_id', $lesson->id)
        ->delete();

    expect(athleteCoverage($this)['totals'])->toMatchArray(['thin' => 0, 'missed' => 1]);
});

// ─── What they have seen lately ──────────────────────────────────────────────

it('lists what they have seen, most recent first', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $triangle = coveredTechnique($this, 'Triangle', 2);

    lessonWith($this, '2026-09-16', [$armbar], [$this->athlete]);
    lessonWith($this, '2026-10-14', [$triangle], [$this->athlete]);

    $lately = athleteCoverage($this)['seen_lately'];

    expect($lately)->toHaveCount(2)
        ->and($lately[0]['name'])->toBe('Triangle')
        ->and($lately[0]['last_seen_on'])->toBe('2026-10-14')
        ->and($lately[1]['name'])->toBe('Armbar');
});

// ─── Empty and edge ──────────────────────────────────────────────────────────

it('reports zero rather than dividing by it for an academy with no programme', function (): void {
    $report = athleteCoverage($this);

    expect($report['totals'])
        ->toMatchArray(['taught_by_academy' => 0, 'percentage' => 0, 'not_taught_yet' => 0]);
});

it('answers for a previous season', function (): void {
    $armbar = coveredTechnique($this, 'Armbar', 1);
    $early = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-09-01']);

    lessonWith($this, '2025-10-15', [$armbar], [$early]);
    lessonWith($this, '2025-10-22', [$armbar], [$early]);

    expect(athleteCoverage($this, $early, ['seasons_back' => 1])['totals'])
        ->toMatchArray(['taught_by_academy' => 1, 'seen' => 1, 'percentage' => 100]);
    expect(athleteCoverage($this, $early)['totals'])
        ->toMatchArray(['taught_by_academy' => 0]);
});

it('refuses to go further back than the report can answer', function (): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/syllabus-coverage?seasons_back=99")
        ->assertStatus(422);
});

// ─── Scoping ─────────────────────────────────────────────────────────────────

it('refuses an athlete from another academy', function (): void {
    $stranger = userWithAcademy();
    $theirAthlete = Athlete::factory()->for($stranger->academy)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$theirAthlete->id}/syllabus-coverage")
        ->assertForbidden();
});

it('refuses somebody with no standing in the academy', function (): void {
    $outsider = User::factory()->create(['active_academy_id' => $this->academy->id]);

    $this->actingAs($outsider)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/syllabus-coverage")
        ->assertForbidden();
});
