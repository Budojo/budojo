<?php

declare(strict_types=1);

use App\Models\AcademyClass;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Illuminate\Support\Carbon;

/**
 * A plan lands on a day the class runs (#1859).
 *
 * Since planning reaches any week of the season, a date the client computed
 * wrongly would create a lesson on a Wednesday for a Monday class — a plan
 * nobody is ever checked into, sitting on the season map as unconfirmed
 * forever. So a write dated today or later must fall on the class's weekday.
 *
 * The past keeps no rule: backfill has had no floor since #181, and a class
 * can have changed weekday since the evening being recorded. Nor does a
 * lesson that already exists: a plan made before the class moved day must
 * still be editable, or it could never be cleared.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    // Thursday 24 September 2026.
    Carbon::setTestNow(Carbon::parse('2026-09-24 18:00:00'));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    // weekday is Carbon's dayOfWeek: 1 = Monday.
    $this->class = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    $this->guard = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Closed guard']);
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function planTopics(mixed $test, string $date, ?array $topicIds = null): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->user)->putJson('/api/v1/lessons/topics', [
        'academy_class_id' => $test->class->id,
        'held_on' => $date,
        'topic_ids' => $topicIds ?? [$test->guard->id],
    ]);
}

it('plans the next Monday of a Monday class', function (): void {
    planTopics($this, '2026-09-28')->assertOk()->assertJsonPath('data.held_on', '2026-09-28');
});

it('plans a Monday months ahead just the same', function (): void {
    planTopics($this, '2027-01-11')->assertOk();
});

it('reads the weekday as the column stores it: a Sunday class plans on Sundays', function (): void {
    // 0 = Sunday. Read as ISO the same Sunday is a 7, which no row can hold.
    $this->class = AcademyClass::factory()->for($this->academy)->create(['weekday' => 0]);

    planTopics($this, '2026-09-27')->assertOk();
    planTopics($this, '2026-09-28')->assertUnprocessable()->assertJsonValidationErrors(['held_on']);
});

it('answers a future plan with no class, or another academy\'s, on the class and not the day', function (): void {
    $this->actingAs($this->user)->putJson('/api/v1/lessons/topics', [
        'held_on' => '2026-09-30',
        'topic_ids' => [$this->guard->id],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['academy_class_id'])
        ->assertJsonMissingValidationErrors(['held_on']);

    $this->class = AcademyClass::factory()->for(userWithAcademy()->academy)->create(['weekday' => 1]);

    planTopics($this, '2026-09-30')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['academy_class_id'])
        ->assertJsonMissingValidationErrors(['held_on']);
});

it('refuses a plan on a Wednesday for a Monday class, and creates nothing', function (): void {
    planTopics($this, '2026-09-30')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['held_on']);

    expect(Lesson::count())->toBe(0);
});

it('counts today as ahead: a Thursday for a Monday class is refused today', function (): void {
    planTopics($this, '2026-09-24')->assertUnprocessable()->assertJsonValidationErrors(['held_on']);
});

it('keeps no rule for the past: the same Wednesday last week is accepted', function (): void {
    planTopics($this, '2026-09-16')->assertOk();
});

it('lets a plan made before the class moved day be edited, and cleared', function (): void {
    planTopics($this, '2026-09-28')->assertOk();
    // The class moves to Tuesday; the Monday plan is now on a day it no longer runs.
    $this->class->update(['weekday' => 2]);

    planTopics($this, '2026-09-28', [])->assertOk()->assertJsonPath('data.topics', []);
});

it('holds the notes to the same rule', function (): void {
    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-09-30',
        'notes' => 'Bring the timer',
    ])->assertUnprocessable()->assertJsonValidationErrors(['held_on']);

    $this->actingAs($this->user)->putJson('/api/v1/lessons/notes', [
        'academy_class_id' => $this->class->id,
        'held_on' => '2026-09-28',
        'notes' => 'Bring the timer',
    ])->assertOk();
});

it('reads any slot, whatever the day: a GET never creates, so it has nothing to refuse', function (): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/lessons?academy_class_id={$this->class->id}&held_on=2026-09-30")
        ->assertOk()
        ->assertJsonPath('data', null);
});
