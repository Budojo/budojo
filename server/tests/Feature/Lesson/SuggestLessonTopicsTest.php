<?php

declare(strict_types=1);

use App\Enums\TopicKind;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * What to teach tonight (#1566).
 *
 * Three rules in order, and the answer says which one fired: never taught
 * this season, then taught once, then least recently taught. No model and no
 * score — a suggestion whose reasoning is invisible gets ignored.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->athlete = Athlete::factory()->for($this->academy)->create();

    // Mid-season and far from the boundary, so nothing here turns on the day
    // the suite happens to run.
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
    $this->mount = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Mount', 'sort_order' => 2,
    ]);
});

function suggestibleTechnique(mixed $test, SyllabusTopic $parent, string $name, int $order, string $kind = 'both'): SyllabusTopic
{
    return SyllabusTopic::factory()->under($parent)->create([
        'name' => $name,
        'sort_order' => $order,
        'kind' => $kind,
    ]);
}

/** A held lesson on a date, naming the given topics. */
function suggestTaughtOn(mixed $test, string $date, array $topics): Lesson
{
    $lesson = Lesson::factory()->for($test->academy)->create([
        'academy_class_id' => $test->class->id,
        'held_on' => $date,
    ]);
    $lesson->topics()->sync(collect($topics)->pluck('id')->all());

    AttendanceRecord::factory()->create([
        'athlete_id' => $test->athlete->id,
        'lesson_id' => $lesson->id,
        'attended_on' => $date,
    ]);

    return $lesson;
}

function suggest(mixed $test, array $query = []): array
{
    $qs = http_build_query([...['academy_class_id' => $test->class->id], ...$query]);

    return $test->actingAs($test->user)
        ->getJson("/api/v1/lessons/suggestions?{$qs}")
        ->assertOk()
        ->json('data');
}

// ─── Rule order ──────────────────────────────────────────────────────────────

it('offers what has never been taught first, in programme order', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    $triangle = suggestibleTechnique($this, $this->guard, 'Triangle', 2);
    suggestibleTechnique($this, $this->mount, 'S-mount', 1);

    // Taught twice, so it is not a candidate under rules 1 or 2.
    suggestTaughtOn($this, '2026-10-01', [$armbar]);
    suggestTaughtOn($this, '2026-10-08', [$armbar]);

    $rows = suggest($this);

    expect($rows)->toHaveCount(3)
        ->and($rows[0]['name'])->toBe('Triangle')
        ->and($rows[0]['reason'])->toBe('never')
        ->and($rows[0]['parent_name'])->toBe('Closed guard')
        // Programme order, so a block of work stays coherent: everything under
        // closed guard before anything under mount.
        ->and($rows[1]['name'])->toBe('S-mount')
        ->and($rows[2]['name'])->toBe('Armbar')
        ->and($rows[2]['reason'])->toBe('stale');
});

it('offers the thin ones next, oldest first', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    $triangle = suggestibleTechnique($this, $this->guard, 'Triangle', 2);
    $sMount = suggestibleTechnique($this, $this->mount, 'S-mount', 1);

    suggestTaughtOn($this, '2026-09-15', [$triangle]);   // thin, older
    suggestTaughtOn($this, '2026-11-10', [$armbar]);     // thin, newer
    suggestTaughtOn($this, '2026-10-01', [$sMount]);
    suggestTaughtOn($this, '2026-10-08', [$sMount]);     // covered

    $rows = suggest($this);

    // Nothing is untaught, so rule 2 leads: the thin ones, oldest first.
    expect($rows[0]['name'])->toBe('Triangle')
        ->and($rows[0]['reason'])->toBe('thin')
        ->and($rows[0]['last_taught_on'])->toBe('2026-09-15')
        ->and($rows[1]['name'])->toBe('Armbar')
        ->and($rows[1]['reason'])->toBe('thin')
        ->and($rows[2]['name'])->toBe('S-mount')
        ->and($rows[2]['reason'])->toBe('stale');
});

it('still answers when everything in season has been covered twice', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    $triangle = suggestibleTechnique($this, $this->guard, 'Triangle', 2);

    suggestTaughtOn($this, '2026-09-01', [$armbar, $triangle]);
    suggestTaughtOn($this, '2026-09-08', [$triangle]);
    suggestTaughtOn($this, '2026-11-10', [$armbar]);

    $rows = suggest($this);

    // An academy on top of its programme is not told "nothing to do".
    expect($rows)->toHaveCount(2)
        ->and($rows[0]['name'])->toBe('Triangle')
        ->and($rows[0]['reason'])->toBe('stale')
        ->and($rows[0]['last_taught_on'])->toBe('2026-09-08')
        ->and($rows[1]['name'])->toBe('Armbar');
});

// ─── Scope ───────────────────────────────────────────────────────────────────

it('never tells a gi class to teach a no-gi technique', function (): void {
    suggestibleTechnique($this, $this->guard, 'Lapel guard', 1, TopicKind::Gi->value);
    suggestibleTechnique($this, $this->guard, 'Heel hook', 2, TopicKind::NoGi->value);
    suggestibleTechnique($this, $this->guard, 'Armbar', 3, TopicKind::Both->value);

    expect(collect(suggest($this))->pluck('name')->all())
        ->toBe(['Lapel guard', 'Armbar']);
});

it('never tells a no-gi class to teach a gi technique', function (): void {
    $this->class->update(['kind' => 'nogi']);
    suggestibleTechnique($this, $this->guard, 'Lapel guard', 1, TopicKind::Gi->value);
    suggestibleTechnique($this, $this->guard, 'Heel hook', 2, TopicKind::NoGi->value);
    suggestibleTechnique($this, $this->guard, 'Armbar', 3, TopicKind::Both->value);

    expect(collect(suggest($this))->pluck('name')->all())
        ->toBe(['Heel hook', 'Armbar']);
});

it('admits everything for a both or other class', function (): void {
    suggestibleTechnique($this, $this->guard, 'Lapel guard', 1, TopicKind::Gi->value);
    suggestibleTechnique($this, $this->guard, 'Heel hook', 2, TopicKind::NoGi->value);

    foreach (['both', 'other'] as $kind) {
        $this->class->update(['kind' => $kind]);
        expect(collect(suggest($this))->pluck('name')->all())
            ->toBe(['Lapel guard', 'Heel hook']);
    }
});

it('leaves out what is not in season and what has left the programme', function (): void {
    suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    $benched = suggestibleTechnique($this, $this->guard, 'Triangle', 2);
    $benched->update(['in_season' => false]);
    $gone = suggestibleTechnique($this, $this->guard, 'Omoplata', 3);
    $gone->delete();

    expect(collect(suggest($this))->pluck('name')->all())->toBe(['Armbar']);
});

it('never suggests a position, only what is taught inside one', function (): void {
    suggestibleTechnique($this, $this->guard, 'Armbar', 1);

    // "Teach closed guard tonight" is not an answer.
    expect(collect(suggest($this))->pluck('name')->all())->toBe(['Armbar']);
});

it('answers with nothing at all when the academy has no programme', function (): void {
    expect(suggest($this))->toBe([]);
});

// ─── The boundaries ──────────────────────────────────────────────────────────

it('does not count a lesson nobody was checked into', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);

    // Planned, never held — no attendance points at it.
    $planned = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-11-10',
    ]);
    $planned->topics()->sync([$armbar->id]);

    expect(suggest($this)[0]['reason'])->toBe('never');
});

it('does not count a lesson planned for later this week', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);

    $future = Lesson::factory()->for($this->academy)->create([
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-11-25',
    ]);
    $future->topics()->sync([$armbar->id]);
    AttendanceRecord::factory()->create([
        'athlete_id' => $this->athlete->id,
        'lesson_id' => $future->id,
        'attended_on' => '2026-11-25',
    ]);

    // Suggesting against next Wednesday's plan would tell the instructor to
    // skip the very thing they just planned.
    expect(suggest($this)[0]['reason'])->toBe('never');
});

it('does not count last season', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    suggestTaughtOn($this, '2026-05-04', [$armbar]);

    expect(suggest($this)[0]['reason'])->toBe('never');
});

it('does not reach into another academy', function (): void {
    suggestibleTechnique($this, $this->guard, 'Armbar', 1);

    $stranger = userWithAcademy();
    $strangerGuard = SyllabusTopic::factory()->for($stranger->academy)->create(['name' => 'Their guard']);
    SyllabusTopic::factory()->under($strangerGuard)->create(['name' => 'Their armbar']);

    expect(collect(suggest($this))->pluck('name')->all())->toBe(['Armbar']);
});

// ─── The contract with the chart ─────────────────────────────────────────────

it('agrees with the coverage report about what is thin', function (): void {
    $armbar = suggestibleTechnique($this, $this->guard, 'Armbar', 1);
    $triangle = suggestibleTechnique($this, $this->guard, 'Triangle', 2);
    suggestibleTechnique($this, $this->guard, 'Omoplata', 3);

    suggestTaughtOn($this, '2026-10-01', [$armbar, $triangle]);
    suggestTaughtOn($this, '2026-10-08', [$armbar]);

    $report = $this->actingAs($this->user)
        ->getJson('/api/v1/stats/syllabus/coverage')
        ->assertOk()
        ->json('data');

    $reasons = collect(suggest($this, ['limit' => 10]))->pluck('reason', 'name');

    // A topic the chart calls thin and the suggestion calls covered would make
    // one of the two screens a liar. Same definition of held, same season.
    expect($report['totals'])->toMatchArray(['covered' => 1, 'thin' => 1, 'missing' => 1])
        ->and($reasons['Omoplata'])->toBe('never')
        ->and($reasons['Triangle'])->toBe('thin')
        ->and($reasons['Armbar'])->toBe('stale');
});

// ─── The endpoint ────────────────────────────────────────────────────────────

it('caps how many it will hand back', function (): void {
    foreach (range(1, 12) as $i) {
        suggestibleTechnique($this, $this->guard, "Technique {$i}", $i);
    }

    expect(suggest($this))->toHaveCount(3)
        ->and(suggest($this, ['limit' => 8]))->toHaveCount(8);

    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons/suggestions?academy_class_id={$this->class->id}&limit=99")
        ->assertStatus(422);
});

it('refuses a class from another academy', function (): void {
    $stranger = userWithAcademy();
    $theirClass = AcademyClass::factory()->for($stranger->academy)->create([
        'weekday' => 1, 'starts_at' => '19:00',
    ]);

    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons/suggestions?academy_class_id={$theirClass->id}")
        ->assertStatus(422);
});

it('refuses somebody with no standing in the academy', function (): void {
    // Active academy set, no membership behind it — so no capability. The
    // previous test already covers a *different* academy's class; this one has
    // to fail on the capability, not on the scoping, or it proves nothing.
    $outsider = User::factory()->create(['active_academy_id' => $this->academy->id]);

    $this->actingAs($outsider)
        ->getJson("/api/v1/lessons/suggestions?academy_class_id={$this->class->id}")
        ->assertForbidden();
});
