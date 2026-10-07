<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use Carbon\CarbonImmutable;

/**
 * #2045 — one athlete's next step, for the phone's promotion sheet: the same
 * answer «Chi promuovere?» gives for them (#1841), from the same ladder rule.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    $this->travelTo(CarbonImmutable::parse('2026-10-06 19:00'));
});

function nextStepOf(object $test, Athlete $athlete): mixed
{
    return $test->actingAs($test->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/next-step")
        ->assertOk()
        ->json('data');
}

function nextStepAthlete(Academy $academy, array $over = []): Athlete
{
    return Athlete::factory()->for($academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 2,
        'status' => AthleteStatus::Active,
        ...$over,
    ]);
}

it('names the next stripe, then the next belt once the stripes are full', function (): void {
    expect(nextStepOf($this, nextStepAthlete($this->academy)))
        ->toBe(['kind' => 'stripe', 'belt' => 'blue', 'stripes' => 3])
        ->and(nextStepOf($this, nextStepAthlete($this->academy, ['stripes' => 4])))
        ->toBe(['kind' => 'belt', 'belt' => 'purple', 'stripes' => 0]);
});

it('walks a child through the kids\' grades, and an adult past them', function (): void {
    $this->academy->update(['martial_art' => 'judo', 'trains_kids' => true]);
    $child = nextStepAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => '2017-03-01']);
    $adult = nextStepAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => '1990-03-01']);

    expect(nextStepOf($this, $child))->toBe(['kind' => 'belt', 'belt' => 'white-and-yellow', 'stripes' => 0])
        ->and(nextStepOf($this, $adult))->toBe(['kind' => 'belt', 'belt' => 'yellow', 'stripes' => 0]);
});

it('says there is none at the top of the ladder', function (): void {
    $top = nextStepAthlete($this->academy, ['belt' => Belt::Red, 'stripes' => 4]);

    expect(nextStepOf($this, $top))->toBeNull();
});

it('answers only for an athlete of the owner\'s own academy', function (): void {
    $elsewhere = nextStepAthlete(Academy::factory()->create());

    $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$elsewhere->id}/next-step")
        ->assertForbidden();
});
