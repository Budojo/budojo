<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

/**
 * #1841 — the athletes who may be ready for their next step, with their facts
 * side by side: time at the belt, since the last promotion, and the training
 * days since. No score and no threshold: the decision stays the owner's.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    $this->travelTo(CarbonImmutable::parse('2026-05-15 12:00'));
});

function candidateAthlete(Academy $academy, array $over = []): Athlete
{
    return Athlete::factory()->for($academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 2,
        'status' => AthleteStatus::Active,
        ...$over,
    ]);
}

function candidateRow(Athlete $athlete, string $kind, string $at, int $userId, int $from = 0, int $to = 0): void
{
    AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'kind' => $kind,
        'from_belt' => $kind === 'belt' ? Belt::White : null,
        'to_belt' => $kind === 'belt' ? $athlete->belt : null,
        'from_stripes' => $from,
        'to_stripes' => $to,
        'belt_at_event' => $athlete->belt,
        'recorded_at' => $at,
        'recorded_by_user_id' => $userId,
    ]);
}

/** @param list<string> $days */
function candidateDays(Athlete $athlete, array $days): void
{
    foreach ($days as $day) {
        AttendanceRecord::factory()->for($athlete)->on($day)->create();
    }
}

function candidates(object $test): array
{
    return $test->actingAs($test->owner)->getJson('/api/v1/promotions/candidates')->assertOk()->json('data');
}

it('reads the time since the last promotion and the training days since it', function (): void {
    $athlete = candidateAthlete($this->academy);
    candidateRow($athlete, 'belt', '2025-06-10 00:00:00', $this->owner->id);
    // 72 distinct days since, one of them twice (gi and no-gi), one before.
    $days = [];
    $day = CarbonImmutable::parse('2025-06-12');
    for ($i = 0; $i < 72; $i++) {
        $days[] = $day->addDays($i * 4)->toDateString();
    }
    candidateDays($athlete, [...$days, $days[0], '2025-06-01']);

    $row = candidates($this)[0];

    expect($row['athlete']['id'])->toBe($athlete->id)
        ->and($row['belt_since'])->toBe('2025-06-10')
        ->and($row['months_at_belt'])->toBe(11)
        ->and($row['last_promoted_on'])->toBe('2025-06-10')
        ->and($row['sessions_since_last_promotion'])->toBe(72);
});

it('measures from the last stripe given on this belt, when there is one', function (): void {
    $athlete = candidateAthlete($this->academy);
    candidateRow($athlete, 'belt', '2025-01-10 00:00:00', $this->owner->id);
    candidateRow($athlete, 'stripe', '2026-02-01 00:00:00', $this->owner->id, from: 1, to: 2);
    candidateDays($athlete, ['2026-01-20', '2026-02-01', '2026-03-05']);

    $row = candidates($this)[0];

    expect($row['stripe_since'])->toBe('2026-02-01')
        ->and($row['last_promoted_on'])->toBe('2026-02-01')
        ->and($row['sessions_since_last_promotion'])->toBe(2);
});

it('counts an athlete with only a starting row from the day their record began', function (): void {
    $athlete = candidateAthlete($this->academy, ['stripes' => 0]);
    AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'kind' => 'belt',
        'from_belt' => null,
        'to_belt' => Belt::Blue,
        'from_stripes' => null,
        'to_stripes' => null,
        'belt_at_event' => Belt::Blue,
        'recorded_at' => '2026-01-15 09:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $row = candidates($this)[0];

    expect($row['last_promoted_on'])->toBe('2026-01-15')
        ->and($row['days_since_last_promotion'])->toBe(120);
});

it('names the next step the way the ladder counts it', function (): void {
    $four = candidateAthlete($this->academy, ['stripes' => 4]);
    $two = candidateAthlete($this->academy, ['stripes' => 2]);
    candidateRow($four, 'belt', '2024-01-01 00:00:00', $this->owner->id);
    candidateRow($two, 'belt', '2025-01-01 00:00:00', $this->owner->id);

    $rows = collect(candidates($this))->keyBy('athlete.id');

    expect($rows[$four->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'purple', 'stripes' => 0])
        ->and($rows[$two->id]['next'])->toBe(['kind' => 'stripe', 'belt' => 'blue', 'stripes' => 3]);
});

it('offers a judo half belt to a child in an academy that trains kids, and not to an adult', function (): void {
    $this->academy->update(['martial_art' => 'judo', 'trains_kids' => true]);
    $child = candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => '2017-03-01']);
    $adult = candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => '1990-03-01']);
    $unknownAge = candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => null]);

    $rows = collect(candidates($this))->keyBy('athlete.id');

    expect($rows[$child->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'white-and-yellow', 'stripes' => 0])
        ->and($rows[$adult->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'yellow', 'stripes' => 0])
        ->and($rows[$unknownAge->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'yellow', 'stripes' => 0]);
});

it('walks a BJJ child from white through the kids\' belts, and a sixteen-year-old on to blue', function (): void {
    $this->academy->update(['trains_kids' => true]);
    // IBJJF: a child starts on white and climbs grey to green; blue from 16.
    $child = candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 4, 'date_of_birth' => '2017-03-01']);
    $sixteen = candidateAthlete($this->academy, ['belt' => Belt::Orange, 'stripes' => 4, 'date_of_birth' => '2010-10-01']);
    $adult = candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 4, 'date_of_birth' => '1990-01-01']);

    $rows = collect(candidates($this))->keyBy('athlete.id');

    expect($rows[$child->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'grey', 'stripes' => 0])
        ->and($rows[$sixteen->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'blue', 'stripes' => 0])
        ->and($rows[$adult->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'blue', 'stripes' => 0]);
});

it('reads a kids\' grade as a child\'s when the date of birth is unknown, whatever the setting', function (): void {
    $this->academy->update(['trains_kids' => false]);
    candidateAthlete($this->academy, ['belt' => Belt::Yellow, 'stripes' => 4, 'date_of_birth' => null]);

    expect(candidates($this)[0]['next'])->toBe(['kind' => 'belt', 'belt' => 'orange', 'stripes' => 0]);
});

it('keeps kids\' grades out when the academy does not train kids', function (): void {
    $this->academy->update(['martial_art' => 'judo', 'trains_kids' => false]);
    candidateAthlete($this->academy, ['belt' => Belt::White, 'stripes' => 0, 'date_of_birth' => '2017-03-01']);

    expect(candidates($this)[0]['next'])->toBe(['kind' => 'belt', 'belt' => 'yellow', 'stripes' => 0]);
});

it('counts a taekwondo dan as the next step on a black belt, and a poom only for the young', function (): void {
    $this->academy->update(['martial_art' => 'taekwondo', 'trains_kids' => true]);
    $black = candidateAthlete($this->academy, ['belt' => Belt::Black, 'stripes' => 2, 'date_of_birth' => '1985-01-01']);
    $cadet = candidateAthlete($this->academy, ['belt' => Belt::RedAndBlack, 'stripes' => 0, 'date_of_birth' => '2013-01-01']);
    $adult = candidateAthlete($this->academy, ['belt' => Belt::RedAndBlack, 'stripes' => 0, 'date_of_birth' => '1995-01-01']);

    $rows = collect(candidates($this))->keyBy('athlete.id');

    expect($rows[$black->id]['next'])->toBe(['kind' => 'stripe', 'belt' => 'black', 'stripes' => 3])
        ->and($rows[$cadet->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'black-and-red', 'stripes' => 0])
        ->and($rows[$adult->id]['next'])->toBe(['kind' => 'belt', 'belt' => 'black', 'stripes' => 0]);
});

it('lists the longest since the last promotion first, and the unknown last', function (): void {
    $recent = candidateAthlete($this->academy);
    $old = candidateAthlete($this->academy);
    $unknown = candidateAthlete($this->academy);
    candidateRow($recent, 'belt', '2026-03-01 00:00:00', $this->owner->id);
    candidateRow($old, 'belt', '2025-03-01 00:00:00', $this->owner->id);

    $ids = array_column(array_column(candidates($this), 'athlete'), 'id');

    expect($ids)->toBe([$old->id, $recent->id, $unknown->id]);
});

it('leaves out inactive athletes and other academies', function (): void {
    candidateAthlete($this->academy, ['status' => AthleteStatus::Inactive]);
    candidateAthlete(userWithAcademy()->academy);
    $kept = candidateAthlete($this->academy);

    $ids = array_column(array_column(candidates($this), 'athlete'), 'id');

    expect($ids)->toBe([$kept->id]);
});

it('is the owner\'s read only', function (): void {
    $this->getJson('/api/v1/promotions/candidates')->assertUnauthorized();
});
