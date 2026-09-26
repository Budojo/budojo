<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;

/**
 * The missing steps of an athlete's promotion history (#1966): read with the
 * timeline, skipped for good, and filled — a fill that matches a gap is never
 * refused by the chain validator, which stays as strict as before for
 * anything else.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-26 12:00:00');
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function gapsAthlete(Academy $academy, Belt $belt, int $stripes, string $dateOfBirth = '1990-01-01'): Athlete
{
    return Athlete::factory()->for($academy)->create([
        'belt' => $belt,
        'stripes' => $stripes,
        'date_of_birth' => $dateOfBirth,
    ]);
}

/** @param array<string, mixed> $attributes */
function promotionRow(Athlete $athlete, User $by, array $attributes): AthletePromotion
{
    return AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'recorded_by_user_id' => $by->id,
        ...$attributes,
    ]);
}

function stripeRowOn(Athlete $athlete, User $by, Belt $belt, int $from, int $to, string $at): AthletePromotion
{
    return promotionRow($athlete, $by, [
        'kind' => 'stripe',
        'from_stripes' => $from,
        'to_stripes' => $to,
        'belt_at_event' => $belt,
        'recorded_at' => $at,
    ]);
}

function beltRowOn(Athlete $athlete, User $by, ?Belt $from, Belt $to, string $at): AthletePromotion
{
    return promotionRow($athlete, $by, [
        'kind' => 'belt',
        'from_belt' => $from,
        'to_belt' => $to,
        'from_stripes' => null,
        'to_stripes' => null,
        'belt_at_event' => $to,
        'recorded_at' => $at,
    ]);
}

/** @return list<string> */
function gapKeys(object $test, Athlete $athlete): array
{
    return array_column(
        $test->actingAs($test->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk()->json('gaps'),
        'key',
    );
}

it("reads Jacopo's missing steps beside his timeline, and marks his starting row", function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 0);
    $third = stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    $response = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$jacopo->id}/promotions")
        ->assertOk();

    expect($response->json('history_starts_at'))->toBe('2024-03-12')
        ->and(array_column($response->json('gaps'), 'key'))->toBe(['stripe:white:4', 'belt:blue:0'])
        ->and($response->json('gaps.0.before.promotion_id'))->toBe($opening->id)
        ->and($response->json('gaps.1.completes_promotion_id'))->toBe($opening->id)
        ->and($response->json('gaps.1.from_belt'))->toBe('white')
        ->and($response->json('gaps.1.after.promotion_id'))->toBe($third->id)
        ->and($response->json('gaps.1.before'))->toBeNull();

    $isOpening = array_column($response->json('data'), 'is_opening', 'id');
    expect($isOpening[$opening->id])->toBeTrue()
        ->and($isOpening[$third->id])->toBeFalse();
});

it('reads the same two steps for Jacopo entered on blue with two stripes', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 2);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$jacopo->id}/promotions")->assertOk()->json('gaps');

    expect(array_column($gaps, 'key'))->toBe(['stripe:white:4', 'belt:blue:0'])
        ->and($gaps[1]['completes_promotion_id'])->toBe($opening->id)
        ->and($gaps[1]['before'])->toBeNull();
});

it('offers the blue stripes only once the blue belt is dated, and never a second blue', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 2);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    // Not a gap yet, so the chain check still decides — and refuses it.
    $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$jacopo->id}/promotions", [
        'kind' => 'stripe', 'recorded_at' => '2024-05-01', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1,
    ])->assertUnprocessable();

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$jacopo->id}/promotions/{$opening->id}", ['recorded_at' => '2025-01-10', 'from_belt' => 'white'])
        ->assertOk();
    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$jacopo->id}/promotions")->assertOk()->json('gaps');
    expect(array_column($gaps, 'key'))->toBe(['stripe:white:4', 'stripe:blue:1', 'stripe:blue:2'])
        ->and($gaps[1]['after'])->toBe(['promotion_id' => $opening->id, 'recorded_at' => '2025-01-10']);

    $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$jacopo->id}/promotions", [
        'kind' => 'stripe', 'recorded_at' => '2025-06-01', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1,
    ])->assertCreated();

    expect(gapKeys($this, $jacopo))->toBe(['stripe:white:4', 'stripe:blue:2'])
        ->and($jacopo->promotions()->where('kind', 'belt')->where('to_belt', 'blue')->count())->toBe(1);
});

it('completes a starting row only inside its window when a gap stands for it', function (): void {
    // Opened on white in 2015, imported on blue in 2026, a blue stripe from
    // 2020 backfilled since: the blue belt came before that stripe.
    $athlete = gapsAthlete($this->academy, Belt::Blue, 1);
    beltRowOn($athlete, $this->owner, null, Belt::White, '2015-01-01 00:00:00');
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');
    $stripe = stripeRowOn($athlete, $this->owner, Belt::Blue, 0, 1, '2020-05-01 00:00:00');

    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk()->json('gaps');
    expect(array_column($gaps, 'key'))->toBe(['belt:blue:0'])
        ->and($gaps[0]['before'])->toBe(['promotion_id' => $stripe->id, 'recorded_at' => '2020-05-01']);

    $patch = "/api/v1/athletes/{$athlete->id}/promotions/{$opening->id}";
    $this->actingAs($this->owner)
        ->patchJson($patch, ['recorded_at' => '2023-01-01', 'from_belt' => 'white'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('recorded_at');
    $this->actingAs($this->owner)->patchJson($patch, ['recorded_at' => '2019-01-01', 'from_belt' => 'white'])->assertOk();

    expect(gapKeys($this, $athlete))->toBe([])
        ->and($athlete->promotions()->where('kind', 'belt')->where('to_belt', 'blue')->count())->toBe(1);
});

it("bounds a window by the owner's today, which after 22:00 UTC is already tomorrow (#1963)", function (): void {
    // 22:30 UTC on the 10th is 00:30 on the 11th in Rome.
    $this->travelTo('2026-10-10 22:30:00');
    $athlete = gapsAthlete($this->academy, Belt::Blue, 1);
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2026-10-10 00:00:00');

    // Judged in UTC the window would be (10th, 10th] — no day — and the gap gone.
    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk()->json('gaps');
    expect(array_column($gaps, 'key'))->toBe(['stripe:blue:1'])
        ->and($gaps[0]['before'])->toBeNull();

    $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'stripe', 'recorded_at' => '2026-10-11', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1,
    ])->assertCreated();

    expect(gapKeys($this, $athlete))->toBe([]);
});

it('reads the gaps over the whole history, whatever the page', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    stripeRowOn($athlete, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    foreach (range(1, 22) as $day) {
        // Filler rows the walk ignores (a stripe count that does not rise),
        // so the page boundary falls between the two rows the gaps hang off.
        stripeRowOn($athlete, $this->owner, Belt::White, 3, 3, sprintf('2024-04-%02d 00:00:00', $day));
    }
    beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    $second = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions?page=2")
        ->assertOk();

    expect(array_column($second->json('gaps'), 'key'))->toBe(['stripe:white:4', 'belt:blue:0']);
});

it("walks the academy's own ladder: a judoka's dan", function (): void {
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $judoka = gapsAthlete($this->academy, Belt::Black, 2);
    beltRowOn($judoka, $this->owner, Belt::Brown, Belt::Black, '2015-05-01 00:00:00');

    expect(gapKeys($this, $judoka))->toBe(['stripe:black:1', 'stripe:black:2']);
});

it("walks a child's kids' grades by the child's age", function (): void {
    $this->academy->update(['trains_kids' => true]);
    $child = gapsAthlete($this->academy, Belt::Grey, 2, '2016-04-01');
    beltRowOn($child, $this->owner, Belt::White, Belt::Grey, '2024-05-01 00:00:00');

    expect(gapKeys($this, $child))->toBe(['stripe:grey:1', 'stripe:grey:2']);
});

it('hides a skipped step for good, and the undo brings it back', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 0);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');
    $skips = "/api/v1/athletes/{$jacopo->id}/promotion-skips";

    $this->actingAs($this->owner)->postJson($skips, ['belt' => 'white', 'stripes' => 4])->assertCreated();
    // Idempotent: a second tap is not a second row, nor an error.
    $this->actingAs($this->owner)->postJson($skips, ['belt' => 'white', 'stripes' => 4])->assertCreated();

    expect(gapKeys($this, $jacopo))->toBe(['belt:blue:0'])
        ->and($jacopo->promotionSkips()->count())->toBe(1);

    $this->actingAs($this->owner)->deleteJson("{$skips}/white/4")->assertNoContent();

    expect(gapKeys($this, $jacopo))->toBe(['stripe:white:4', 'belt:blue:0']);
});

it("refuses a skip the academy's ladder does not have", function (array $payload): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/promotion-skips", $payload)
        ->assertUnprocessable();
})->with([
    'more stripes than the belt carries' => [['belt' => 'purple', 'stripes' => 9]],
    'a colour bjj does not award' => [['belt' => 'white-and-yellow', 'stripes' => 0]],
    'no belt' => [['stripes' => 1]],
]);

it("keeps another academy's athletes out of skips", function (): void {
    $stranger = gapsAthlete(Academy::factory()->create(), Belt::Blue, 0);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$stranger->id}/promotion-skips", ['belt' => 'white', 'stripes' => 4])
        ->assertForbidden();
    $this->actingAs($this->owner)
        ->deleteJson("/api/v1/athletes/{$stranger->id}/promotion-skips/white/4")
        ->assertForbidden();
});

it('completes a starting row with its first belt and real date, instead of adding a second', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 0);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    $response = $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$jacopo->id}/promotions/{$opening->id}", [
            'recorded_at' => '2025-02-01',
            'from_belt' => 'white',
        ])
        ->assertOk();

    expect($response->json('data.from_belt'))->toBe('white')
        ->and($response->json('data.is_opening'))->toBeFalse()
        ->and($jacopo->promotions()->count())->toBe(2);

    $timeline = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$jacopo->id}/promotions")->assertOk();
    expect(array_column($timeline->json('gaps'), 'key'))->toBe(['stripe:white:4'])
        // "Su questa cintura dal…" now counts from the promotion, not data entry.
        ->and($timeline->json('progression.belt_since'))->toStartWith('2025-02-01');
});

it('refuses a first belt on a row that already has one', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    $promotion = beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2025-01-10 00:00:00');

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => '2025-01-10',
            'from_belt' => 'grey',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from_belt');

    expect($promotion->fresh()?->from_belt)->toBe(Belt::White);
});

it("refuses a first belt that is the row's own belt, or one on a stripe row", function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 1);
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2025-01-10 00:00:00');
    $stripe = stripeRowOn($athlete, $this->owner, Belt::Blue, 0, 1, '2025-06-10 00:00:00');

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$opening->id}", ['recorded_at' => '2025-01-10', 'from_belt' => 'blue'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from_belt');
    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$stripe->id}", ['recorded_at' => '2025-06-10', 'from_belt' => 'white'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from_belt');
});

it("fills a stripe on a new belt, which the chain alone refuses after the old belt's stripes", function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 2);
    stripeRowOn($athlete, $this->owner, Belt::White, 3, 4, '2025-09-10 00:00:00');
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2025-12-20 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 1, 2, '2026-06-15 00:00:00');
    expect(gapKeys($this, $athlete))->toBe(['stripe:blue:1']);

    $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'stripe',
        'recorded_at' => '2026-02-01',
        'belt_at_event' => 'blue',
        'from_stripes' => 0,
        'to_stripes' => 1,
    ])->assertCreated();

    expect(gapKeys($this, $athlete))->toBe([]);
});

it('fills consecutive gaps in any order', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 4);
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2024-01-10 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 3, 4, '2025-06-01 00:00:00');
    expect(gapKeys($this, $athlete))->toBe(['stripe:blue:1', 'stripe:blue:2', 'stripe:blue:3']);

    foreach ([[0, 1, '2024-03-01'], [2, 3, '2025-01-01'], [1, 2, '2024-09-01']] as [$from, $to, $on]) {
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
            'kind' => 'stripe',
            'recorded_at' => $on,
            'belt_at_event' => 'blue',
            'from_stripes' => $from,
            'to_stripes' => $to,
        ])->assertCreated();
    }

    expect(gapKeys($this, $athlete))->toBe([]);
});

it('fills a gap on any day of its window, both edges included where the window says so', function (string $on): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 2);
    stripeRowOn($athlete, $this->owner, Belt::White, 3, 4, '2025-09-10 00:00:00');
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2025-12-20 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 1, 2, '2026-06-15 00:00:00');

    $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'stripe',
        'recorded_at' => $on,
        'belt_at_event' => 'blue',
        'from_stripes' => 0,
        'to_stripes' => 1,
    ])->assertCreated();

    expect(gapKeys($this, $athlete))->toBe([]);
})->with(['2025-12-21', '2026-03-15', '2026-06-15']);

it('still refuses a backfill that is no gap and contradicts the rows around it', function (array $payload): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 4);
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2024-01-10 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 3, 4, '2025-06-01 00:00:00');

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/promotions", ['kind' => 'stripe', 'belt_at_event' => 'blue', ...$payload])
        ->assertUnprocessable();
})->with([
    'a stripe the next row already holds' => [['recorded_at' => '2024-06-01', 'from_stripes' => 3, 'to_stripes' => 4]],
    'a gap, dated outside its window' => [['recorded_at' => '2023-06-01', 'from_stripes' => 0, 'to_stripes' => 1]],
]);
