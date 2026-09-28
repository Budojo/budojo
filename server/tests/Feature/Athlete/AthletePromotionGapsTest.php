<?php

declare(strict_types=1);

use App\Enums\AppLocale;
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
        // Already blue the day he was entered: the promotion is no later.
        ->and($response->json('gaps.1.before'))->toBe(['promotion_id' => $opening->id, 'recorded_at' => '2026-09-20']);

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
        ->and($gaps[1]['before'])->toBe(['promotion_id' => $opening->id, 'recorded_at' => '2026-09-20']);
});

it('offers the blue stripes only once the blue belt is dated, and never a second blue', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 2);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

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

it('saves a blue stripe typed before the blue belt is dated, and the belt step closes before it (#1991)', function (): void {
    // Not one of the gaps: before #1991 the chain check refused it. It is
    // no contradiction — the blue belt came some day between the white
    // stripe and this one — so it saves as typed, and the step the starting
    // row stands for now has to fall before it.
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 1);
    $white = stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 10:00:00');

    $created = $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$jacopo->id}/promotions", [
        'kind' => 'stripe', 'recorded_at' => '2024-05-01', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1,
    ])->assertCreated();

    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$jacopo->id}/promotions")->assertOk()->json('gaps');
    expect(array_column($gaps, 'key'))->toBe(['stripe:white:4', 'belt:blue:0'])
        ->and($gaps[1]['completes_promotion_id'])->toBe($opening->id)
        ->and($gaps[1]['after'])->toBe(['promotion_id' => $white->id, 'recorded_at' => '2024-03-12'])
        ->and($gaps[1]['before'])->toBe(['promotion_id' => $created->json('data.id'), 'recorded_at' => '2024-05-01']);
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

it('lists a step filled on the day of the row after it below that row, the way the gaps replay it', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 4);
    $belt = beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2024-01-10 00:00:00');
    $fourth = stripeRowOn($athlete, $this->owner, Belt::Blue, 3, 4, '2025-06-01 00:00:00');

    // The third stripe, filled on the day of the fourth: a higher id, an
    // earlier step.
    $third = $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$athlete->id}/promotions", [
        'kind' => 'stripe', 'recorded_at' => '2025-06-01', 'belt_at_event' => 'blue', 'from_stripes' => 2, 'to_stripes' => 3,
    ])->assertCreated()->json('data.id');

    $page = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk();

    expect(array_column($page->json('data'), 'id'))->toBe([$fourth->id, $third, $belt->id])
        ->and(array_column($page->json('gaps'), 'key'))->toBe(['stripe:blue:1', 'stripe:blue:2'])
        ->and($page->json('gaps.1.before.promotion_id'))->toBe($third);
});

it('pages the listing in that order with the same meta as before', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    foreach (range(1, 25) as $day) {
        stripeRowOn($athlete, $this->owner, Belt::White, 3, 3, sprintf('2024-04-%02d 00:00:00', $day));
    }

    $first = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk();
    $second = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions?page=2")->assertOk();

    expect(array_keys($first->json('meta')))->toBe(['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'])
        ->and(array_keys($first->json('links')))->toBe(['first', 'last', 'prev', 'next'])
        ->and($first->json('meta.per_page'))->toBe(20)
        ->and($first->json('meta.total'))->toBe(25)
        ->and($second->json('meta.current_page'))->toBe(2)
        ->and($second->json('meta.from'))->toBe(21)
        ->and($second->json('meta.to'))->toBe(25)
        ->and($first->json('meta.path'))->toEndWith("/api/v1/athletes/{$athlete->id}/promotions")
        // Newest first across the page boundary.
        ->and(substr((string) $first->json('data.0.recorded_at'), 0, 10))->toBe('2024-04-25')
        ->and(substr((string) $second->json('data.4.recorded_at'), 0, 10))->toBe('2024-04-01');
});

/** Blue with two stripes, recorded one by one since 2024. */
function blueWithTwoStripes(object $test): array
{
    $athlete = gapsAthlete($test->academy, Belt::Blue, 2);
    $belt = beltRowOn($athlete, $test->owner, Belt::White, Belt::Blue, '2024-01-10 00:00:00');
    $first = stripeRowOn($athlete, $test->owner, Belt::Blue, 0, 1, '2024-06-01 00:00:00');
    $second = stripeRowOn($athlete, $test->owner, Belt::Blue, 1, 2, '2025-01-01 00:00:00');

    return [$athlete, [$second->id, $first->id, $belt->id]];
}

it('may list a belt mistake corrected the same day above its undo, and offers nothing for it', function (): void {
    [$athlete, $history] = blueWithTwoStripes($this);
    // White by mistake, blue again: the same midnight since #1963.
    $mistake = beltRowOn($athlete, $this->owner, Belt::Blue, Belt::White, '2026-09-10 00:00:00');
    $undo = beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2026-09-10 00:00:00');

    $page = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk();

    // A known cosmetic limit: ordered by where each row starts, the undo
    // replays first, so the mistake is listed above it. The gaps are right.
    expect(array_column($page->json('data'), 'id'))->toBe([$mistake->id, $undo->id, ...$history])
        ->and($page->json('gaps'))->toBe([]);
});

it('may list a stripe mistake corrected the same day above its undo, and offers nothing for it', function (): void {
    [$athlete, $history] = blueWithTwoStripes($this);
    $mistake = stripeRowOn($athlete, $this->owner, Belt::Blue, 2, 0, '2026-09-10 00:00:00');
    $undo = stripeRowOn($athlete, $this->owner, Belt::Blue, 0, 2, '2026-09-10 00:00:00');

    $page = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk();

    // A known cosmetic limit: ordered by where each row starts, the undo
    // replays first, so the mistake is listed above it. The gaps are right.
    expect(array_column($page->json('data'), 'id'))->toBe([$mistake->id, $undo->id, ...$history])
        ->and($page->json('gaps'))->toBe([]);
});

it('answers a page far past the last with an empty page, not an error', function (): void {
    [$athlete] = blueWithTwoStripes($this);

    $page = $this->actingAs($this->owner)
        ->getJson("/api/v1/athletes/{$athlete->id}/promotions?page=500000000000000000")
        ->assertOk();

    expect($page->json('data'))->toBe([])
        ->and($page->json('meta.current_page'))->toBe(500000000000000000)
        ->and($page->json('meta.from'))->toBeNull()
        ->and($page->json('meta.to'))->toBeNull()
        ->and($page->json('meta.total'))->toBe(3);
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

it('completes a starting row on its own day at the latest: the athlete held the belt when entered', function (): void {
    $jacopo = gapsAthlete($this->academy, Belt::Blue, 0);
    stripeRowOn($jacopo, $this->owner, Belt::White, 2, 3, '2024-03-12 00:00:00');
    $opening = beltRowOn($jacopo, $this->owner, null, Belt::Blue, '2026-09-20 00:00:00');
    $patch = "/api/v1/athletes/{$jacopo->id}/promotions/{$opening->id}";

    $this->actingAs($this->owner)
        ->patchJson($patch, ['recorded_at' => '2026-09-21', 'from_belt' => 'white'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('recorded_at');
    $this->actingAs($this->owner)->patchJson($patch, ['recorded_at' => '2026-09-20', 'from_belt' => 'white'])->assertOk();

    expect($opening->fresh()?->from_belt)->toBe(Belt::White);
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

it('still warns about a backfill that is no gap and contradicts the rows around it', function (array $payload): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 4);
    beltRowOn($athlete, $this->owner, Belt::White, Belt::Blue, '2024-01-10 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 3, 4, '2025-06-01 00:00:00');

    $this->actingAs($this->owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/promotions", ['kind' => 'stripe', 'belt_at_event' => 'blue', ...$payload])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'chain_conflict');
})->with([
    'a stripe the next row already holds' => [['recorded_at' => '2024-06-01', 'from_stripes' => 3, 'to_stripes' => 4]],
    'a gap, dated outside its window' => [['recorded_at' => '2023-06-01', 'from_stripes' => 0, 'to_stripes' => 1]],
]);

// ── A history that opens on its starting row (#1974) ─────────────────────────

it('asks for the real date and the belt before, when the history opens on the starting row', function (): void {
    // The most common imported athlete: entered as blue, stripes given live since.
    $athlete = gapsAthlete($this->academy, Belt::Blue, 2);
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 0, 1, '2026-03-01 00:00:00');
    stripeRowOn($athlete, $this->owner, Belt::Blue, 1, 2, '2026-06-01 00:00:00');

    $gaps = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk()->json('gaps');

    expect($gaps)->toBe([[
        'key' => 'belt:blue:0',
        'kind' => 'belt',
        'belt' => 'blue',
        'from_belt' => 'white',
        'from_stripes' => null,
        'to_stripes' => null,
        'after' => null,
        'before' => ['promotion_id' => $opening->id, 'recorded_at' => '2026-01-10'],
        'completes_promotion_id' => $opening->id,
        'from_belt_options' => ['white'],
    ]]);
});

it('completes a starting row that opens the history, and "since" counts from the real day', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');

    $response = $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$opening->id}", [
            'recorded_at' => '2019-05-01',
            'from_belt' => 'white',
        ])
        ->assertOk();

    expect($response->json('data.from_belt'))->toBe('white')
        ->and($response->json('data.is_opening'))->toBeFalse()
        // Completed, never duplicated.
        ->and($athlete->promotions()->count())->toBe(1);

    $timeline = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk();
    // An ordinary belt row with a date: nothing before it is offered.
    expect($timeline->json('gaps'))->toBe([])
        ->and($timeline->json('progression.belt_since'))->toStartWith('2019-05-01');
});

it('completes it no later than the day the athlete was entered, however far back', function (string $on, bool $accepted): void {
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');

    $response = $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$opening->id}", ['recorded_at' => $on, 'from_belt' => 'white']);

    $accepted ? $response->assertOk() : $response->assertUnprocessable()->assertJsonValidationErrors('recorded_at');
})->with([
    'years before' => ['1998-06-01', true],
    'the day of entry' => ['2026-01-10', true],
    'the day after' => ['2026-01-11', false],
]);

it("says the completion's window in the owner's language (#1991)", function (): void {
    $this->owner->update(['locale' => AppLocale::It]);
    $athlete = gapsAthlete($this->academy, Belt::Blue, 0);
    $opening = beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$opening->id}", ['recorded_at' => '2026-01-11', 'from_belt' => 'white'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.recorded_at.0', 'Non può essere oltre il 10 gennaio 2026.');
});

it('lets the owner choose any belt the ladder allows before, and refuses one it does not', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $judoka = gapsAthlete($this->academy, Belt::Black, 0);
    $opening = beltRowOn($judoka, $this->owner, null, Belt::Black, '2026-01-10 00:00:00');
    $patch = "/api/v1/athletes/{$judoka->id}/promotions/{$opening->id}";

    $gap = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$judoka->id}/promotions")->assertOk()->json('gaps.0');
    expect($gap['from_belt'])->toBe('brown')
        ->and($gap['from_belt_options'])->toContain('blue');

    // Not the suggestion, but a belt the ladder allows: the owner knows.
    $this->actingAs($this->owner)->patchJson($patch, ['recorded_at' => '2020-01-01', 'from_belt' => 'blue'])->assertOk();

    $other = gapsAthlete($this->academy, Belt::Blue, 0);
    $below = beltRowOn($other, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');
    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$other->id}/promotions/{$below->id}", ['recorded_at' => '2020-01-01', 'from_belt' => 'brown'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from_belt');
});

it('offers an imported adult with no date of birth only the adult belts before', function (): void {
    // The most common import: a BJJ blue, no date of birth on file. Asked
    // about each candidate, the kids' rule offered grey to green and
    // preselected green — "Verde → Blu" recorded for an adult.
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue, 'stripes' => 0, 'date_of_birth' => null]);
    beltRowOn($athlete, $this->owner, null, Belt::Blue, '2026-01-10 00:00:00');

    $gap = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}/promotions")->assertOk()->json('gaps.0');

    expect($gap['from_belt'])->toBe('white')
        ->and($gap['from_belt_options'])->toBe(['white']);
});

it('admits every belt it lists before a row that opens the history, anywhere in the window', function (string $option, string $on): void {
    // A later row on a higher belt must not turn a listed option down: the
    // list and the window are the check for a row nothing precedes.
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $judoka = gapsAthlete($this->academy, Belt::Blue, 0);
    // Orange on entry, then green → blue with the step out of orange never
    // recorded: the next belt row starts on green, not on the row's orange.
    $opening = beltRowOn($judoka, $this->owner, null, Belt::Orange, '2024-01-10 00:00:00');
    beltRowOn($judoka, $this->owner, Belt::Green, Belt::Blue, '2025-06-01 00:00:00');

    $gap = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$judoka->id}/promotions")->assertOk()->json('gaps.0');
    expect($gap['completes_promotion_id'])->toBe($opening->id)
        ->and($gap['from_belt_options'])->toContain($option);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$judoka->id}/promotions/{$opening->id}", ['recorded_at' => $on, 'from_belt' => $option])
        ->assertOk();
    expect($opening->fresh()?->from_belt?->value)->toBe($option);
})->with([
    'white, years before' => ['white', '1998-06-01'],
    'white, the day of entry' => ['white', '2024-01-10'],
    'yellow, years before' => ['yellow', '1998-06-01'],
    'yellow, the day of entry' => ['yellow', '2024-01-10'],
]);

it('offers nothing to complete on a history that opens on the first belt of the ladder', function (): void {
    $athlete = gapsAthlete($this->academy, Belt::White, 1);
    beltRowOn($athlete, $this->owner, null, Belt::White, '2026-01-10 00:00:00');

    expect(gapKeys($this, $athlete))->toBe([]);
});
