<?php

declare(strict_types=1);

use App\Enums\AttendanceSource;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\AcademyMembership;
use App\Models\Athlete;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * What a lesson covered (#1564) — the join between the timetable and the
 * programme.
 *
 * The rule the whole feature turns on: topics on a future lesson are a plan,
 * the check-in is the confirmation, and a lesson nobody was checked into is
 * never counted as held. Nothing stores that distinction — it falls out of
 * whether any attendance points at the row.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->class = AcademyClass::factory()->for($this->academy)->create([
        'name' => 'Fundamentals', 'weekday' => 1, 'starts_at' => '19:00',
    ]);
    $this->closedGuard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);
    $this->armbar = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Armbar']);
    $this->triangle = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Triangle']);
});

function setTopics(mixed $test, array $topicIds, string $date = '2026-09-14'): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $test->class->id,
        'held_on' => $date,
        'topic_ids' => $topicIds,
    ]);
}

function readLesson(mixed $test, string $date = '2026-09-14'): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)
        ->getJson("/api/v1/lessons?academy_class_id={$test->class->id}&held_on={$date}");
}

// ─── Reading a slot ──────────────────────────────────────────────────────────

it('answers null for a slot nobody has touched, and creates nothing', function (): void {
    readLesson($this)->assertOk()->assertJsonPath('data', null);

    expect(Lesson::count())->toBe(0);
});

// ─── Attaching ───────────────────────────────────────────────────────────────

it('creates the lesson on the first tag — which is how a plan exists at all', function (): void {
    expect(Lesson::count())->toBe(0);

    setTopics($this, [$this->armbar->id])
        ->assertOk()
        ->assertJsonPath('data.name', 'Fundamentals')
        ->assertJsonPath('data.starts_at', '19:00')
        ->assertJsonPath('data.held_on', '2026-09-14')
        ->assertJsonPath('data.held', false)
        ->assertJsonCount(1, 'data.topics')
        ->assertJsonPath('data.topics.0.name', 'Armbar')
        ->assertJsonPath('data.topics.0.parent_name', 'Closed guard');

    expect(Lesson::count())->toBe(1);
});

it('is idempotent: the same list twice changes nothing', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();

    expect(Lesson::count())->toBe(1);
    expect(Lesson::first()?->topics()->count())->toBe(2);
});

it('detaches what is left out, and re-attaches what comes back', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();

    setTopics($this, [$this->triangle->id])
        ->assertOk()
        ->assertJsonCount(1, 'data.topics')
        ->assertJsonPath('data.topics.0.name', 'Triangle');

    setTopics($this, [$this->armbar->id, $this->triangle->id])
        ->assertOk()
        ->assertJsonCount(2, 'data.topics');
});

it('takes the last topic off — an empty list is how that is said', function (): void {
    setTopics($this, [$this->armbar->id])->assertOk();

    setTopics($this, [])->assertOk()->assertJsonCount(0, 'data.topics');

    // The lesson stays: it may still be held, and it still carries its notes.
    expect(Lesson::count())->toBe(1);
});

it('tags a position without tagging what is under it — "we worked half guard" is an answer', function (): void {
    setTopics($this, [$this->closedGuard->id])
        ->assertOk()
        ->assertJsonCount(1, 'data.topics')
        ->assertJsonPath('data.topics.0.name', 'Closed guard')
        ->assertJsonPath('data.topics.0.parent_name', null);
});

// ─── What is refused ─────────────────────────────────────────────────────────

it('refuses a topic from another academy', function (): void {
    $foreign = SyllabusTopic::factory()->for(Academy::factory()->create())->create();

    setTopics($this, [$foreign->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['topic_ids.0']);

    expect(Lesson::count())->toBe(0);
});

it('refuses a topic that has left the programme', function (): void {
    $this->armbar->delete();

    setTopics($this, [$this->armbar->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['topic_ids.0']);
});

it('refuses a class from another academy', function (): void {
    $foreign = AcademyClass::factory()->create();

    $this->actingAs($this->user)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $foreign->id,
        'held_on' => '2026-09-14',
        'topic_ids' => [],
    ])->assertUnprocessable()->assertJsonValidationErrors(['academy_class_id']);
});

it('refuses a slot it cannot read', function (string $field, array $payload): void {
    $this->actingAs($this->user)
        ->putJson('/api/v1/lessons/topics', [...$payload, 'topic_ids' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'no class' => ['academy_class_id', ['held_on' => '2026-09-14']],
    'no date' => ['held_on', ['academy_class_id' => 1]],
    'malformed date' => ['held_on', ['academy_class_id' => 1, 'held_on' => '14/09/2026']],
]);

it('refuses a list with the same topic twice', function (): void {
    setTopics($this, [$this->armbar->id, $this->armbar->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['topic_ids.0']);
});

// ─── Planned, then held ──────────────────────────────────────────────────────

it('reports a planned lesson as not held, however many topics it carries', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id], '2026-12-25')->assertOk();

    readLesson($this, '2026-12-25')
        ->assertOk()
        ->assertJsonPath('data.held', false)
        ->assertJsonCount(2, 'data.topics');
});

it('is held once somebody is checked in, and the plan is untouched by it', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();

    $athlete = Athlete::factory()->for($this->academy)->create();
    app(\App\Actions\Attendance\MarkAttendanceAction::class)->execute(
        $this->academy,
        CarbonImmutable::parse('2026-09-14'),
        [$athlete->id],
        AttendanceSource::Instructor,
        $this->class,
    );

    readLesson($this)
        ->assertOk()
        ->assertJsonPath('data.held', true)
        // The confirmation is the check-in; it does not get a say in what
        // was taught.
        ->assertJsonCount(2, 'data.topics');

    // And it reused the planned lesson rather than forking the evening.
    expect(Lesson::count())->toBe(1);
});

it('lets the list be amended after the fact — "we did X instead"', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    app(\App\Actions\Attendance\MarkAttendanceAction::class)->execute(
        $this->academy,
        CarbonImmutable::parse('2026-09-14'),
        [$athlete->id],
        AttendanceSource::Instructor,
        $this->class,
    );

    setTopics($this, [$this->triangle->id])
        ->assertOk()
        ->assertJsonPath('data.held', true)
        ->assertJsonPath('data.topics.0.name', 'Triangle');
});

// ─── A topic that leaves the programme ───────────────────────────────────────

it('keeps naming a topic on the lessons that taught it after it leaves the programme', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();

    $this->armbar->delete();

    readLesson($this)
        ->assertOk()
        ->assertJsonCount(2, 'data.topics')
        ->assertJsonPath('data.topics.0.name', 'Armbar')
        ->assertJsonPath('data.topics.0.deleted', true)
        ->assertJsonPath('data.topics.1.deleted', false);
});

it('does not drop a departed topic when the rest of the list is edited', function (): void {
    setTopics($this, [$this->armbar->id, $this->triangle->id])->assertOk();
    $this->armbar->delete();

    // The picker cannot offer the armbar any more, so it is not in the
    // payload — and editing tonight's list must not rewrite what was taught.
    $kimura = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Kimura']);
    setTopics($this, [$this->triangle->id, $kimura->id])->assertOk();

    $names = collect(readLesson($this)->json('data.topics'))->pluck('name')->sort()->values()->all();
    expect($names)->toBe(['Armbar', 'Kimura', 'Triangle']);
});

it('keeps naming the position of a technique whose position is gone', function (): void {
    setTopics($this, [$this->armbar->id])->assertOk();

    $this->closedGuard->delete();

    readLesson($this)
        ->assertOk()
        ->assertJsonPath('data.topics.0.name', 'Armbar')
        ->assertJsonPath('data.topics.0.parent_name', 'Closed guard');
});

// ─── Notes ───────────────────────────────────────────────────────────────────

it('keeps a note on the lesson, and creates the lesson for it', function (): void {
    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-09-14',
        'notes' => "  Marco's first day back  ",
    ])
        ->assertOk()
        ->assertJsonPath('data.notes', "Marco's first day back");

    expect(Lesson::count())->toBe(1);
});

it('stores an emptied note as nothing at all', function (): void {
    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id, 'held_on' => '2026-09-14', 'notes' => 'Something',
    ])->assertOk();

    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id, 'held_on' => '2026-09-14', 'notes' => '   ',
    ])->assertOk()->assertJsonPath('data.notes', null);

    expect(Lesson::first()?->notes)->toBeNull();
});

it('leaves the topics alone when only the note changes', function (): void {
    setTopics($this, [$this->armbar->id])->assertOk();

    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id, 'held_on' => '2026-09-14', 'notes' => 'Warm gym',
    ])
        ->assertOk()
        ->assertJsonCount(1, 'data.topics');
});

// ─── Recent topics ───────────────────────────────────────────────────────────

it('offers what the academy taught most recently, most recent first', function (): void {
    $kimura = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Kimura']);

    // Past days, relatively: the group reads what was taught, and a fixed
    // future date would drop out of it the moment the filter is right.
    setTopics($this, [$this->armbar->id], CarbonImmutable::today()->subDays(14)->toDateString())->assertOk();
    setTopics($this, [$this->triangle->id], CarbonImmutable::today()->subDays(7)->toDateString())->assertOk();
    setTopics($this, [$kimura->id], CarbonImmutable::today()->toDateString())->assertOk();

    $names = collect($this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->json('data'))
        ->pluck('name')
        ->all();

    expect($names)->toBe(['Kimura', 'Triangle', 'Armbar']);
});

it('does not call a future plan "taught lately" — nothing has been taught yet', function (): void {
    $planned = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => 'Kimura']);

    setTopics($this, [$this->armbar->id], CarbonImmutable::yesterday()->toDateString())->assertOk();
    setTopics($this, [$planned->id], CarbonImmutable::today()->addWeek()->toDateString())->assertOk();

    $names = collect($this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->json('data'))
        ->pluck('name')
        ->all();

    expect($names)->toBe(['Armbar']);
});

it('counts today as taught — the evening being checked in is the common case', function (): void {
    setTopics($this, [$this->armbar->id], CarbonImmutable::today()->toDateString())->assertOk();

    $this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('fills the group to its cap, counting only what can still be offered', function (): void {
    // Thirteen topics taught on thirteen days, the most recent one then taken
    // out of the programme: filtering after the cap would return eleven.
    $topics = [];
    foreach (range(1, 13) as $i) {
        $topics[$i] = SyllabusTopic::factory()->under($this->closedGuard)->create(['name' => "Move {$i}"]);
        setTopics($this, [$topics[$i]->id], CarbonImmutable::today()->subDays(14 - $i)->toDateString())->assertOk();
    }
    $topics[13]->delete();

    $this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->assertJsonCount(12, 'data');
});

it('names a topic once however many lessons taught it', function (): void {
    setTopics($this, [$this->armbar->id], CarbonImmutable::today()->subDays(7)->toDateString())->assertOk();
    setTopics($this, [$this->armbar->id], CarbonImmutable::today()->toDateString())->assertOk();

    $this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('does not offer a topic that has left the programme, nor another academy\'s', function (): void {
    $past = CarbonImmutable::today()->subDay()->toDateString();
    setTopics($this, [$this->armbar->id, $this->triangle->id], $past)->assertOk();
    $this->armbar->delete();

    $other = userWithAcademy();
    $theirTopic = SyllabusTopic::factory()->for($other->academy)->create(['name' => 'Theirs']);
    $theirClass = AcademyClass::factory()->for($other->academy)->create();
    $this->actingAs($other)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $theirClass->id, 'held_on' => $past, 'topic_ids' => [$theirTopic->id],
    ])->assertOk();

    $names = collect($this->actingAs($this->user)
        ->getJson('/api/v1/lessons/recent-topics')
        ->assertOk()
        ->json('data'))
        ->pluck('name')
        ->all();

    expect($names)->toBe(['Triangle']);
});

// ─── Scoping and capability ──────────────────────────────────────────────────

it('never reads another academy lesson through its own class', function (): void {
    $foreignClass = AcademyClass::factory()->create();
    Lesson::factory()->forClass($foreignClass, '2026-09-14')->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons?academy_class_id={$foreignClass->id}&held_on=2026-09-14")
        ->assertUnprocessable();
});

it('lets anyone who records attendance say what was taught, and no one else', function (
    string $role,
    bool $mayWrite,
): void {
    $academy = Academy::factory()->create();
    $member = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($member)->for($academy)->create(['role' => $role]);
    $class = AcademyClass::factory()->for($academy)->create();
    $topic = SyllabusTopic::factory()->for($academy)->create();

    $this->actingAs($member)
        ->getJson("/api/v1/lessons?academy_class_id={$class->id}&held_on=2026-09-14")
        ->assertOk();

    $write = $this->actingAs($member)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $class->id, 'held_on' => '2026-09-14', 'topic_ids' => [$topic->id],
    ]);

    $mayWrite ? $write->assertOk() : $write->assertForbidden();
})->with([
    'owner' => ['owner', true],
    'admin' => ['admin', true],
    // An instructor records who was there, so they record what was taught.
    'instructor' => ['instructor', true],
    'assistant' => ['assistant', true],
]);
