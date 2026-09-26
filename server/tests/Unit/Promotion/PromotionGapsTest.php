<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\MartialArt\RankLadder;
use App\Support\Promotion\PromotionGaps;
use App\Support\Promotion\PromotionRecord;
use Carbon\CarbonImmutable;

/**
 * The steps an athlete's promotion history is missing (#1966), found by
 * walking the academy's ladder between the rows that exist.
 */
function stripeRow(int $id, Belt $belt, int $from, int $to, string $at): PromotionRecord
{
    return new PromotionRecord($id, 'stripe', null, null, $from, $to, $belt, CarbonImmutable::parse($at));
}

function beltRow(int $id, ?Belt $from, Belt $to, string $at): PromotionRecord
{
    return new PromotionRecord($id, 'belt', $from, $to, null, null, $to, CarbonImmutable::parse($at));
}

function ladderFor(MartialArt $art): RankLadder
{
    return MartialArtProfile::for($art)->ladder();
}

/**
 * @param list<PromotionRecord> $records
 * @param list<string>          $skipped
 *
 * @return array{gaps: list<array<string, mixed>>, history_starts_at: string|null}
 */
function gapsOf(array $records, Belt $belt, int $stripes, MartialArt $art = MartialArt::Bjj, ?Closure $kids = null, array $skipped = []): array
{
    $finder = new PromotionGaps(
        ladderFor($art),
        $kids ?? static fn (Belt $belt, CarbonImmutable $on): bool => false,
        CarbonImmutable::parse('2026-09-26'),
    );

    return $finder->find($records, $belt, $stripes, $skipped);
}

/** @param array{gaps: list<array<string, mixed>>, history_starts_at: string|null} $result */
function keysOf(array $result): array
{
    return array_column($result['gaps'], 'key');
}

it("finds Jacopo's two missing steps: the fourth stripe, and the blue his starting row stands for", function (): void {
    $result = gapsOf([
        stripeRow(12, Belt::White, 2, 3, '2024-03-12'),
        beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00'),
    ], Belt::Blue, 0);

    expect($result['history_starts_at'])->toBe('2024-03-12')
        ->and($result['gaps'])->toBe([
            [
                'key' => 'stripe:white:4',
                'kind' => 'stripe',
                'belt' => 'white',
                'from_belt' => null,
                'from_stripes' => 3,
                'to_stripes' => 4,
                'after' => ['promotion_id' => 12, 'recorded_at' => '2024-03-12'],
                'before' => ['promotion_id' => 15, 'recorded_at' => '2026-09-26'],
                'completes_promotion_id' => null,
            ],
            [
                'key' => 'belt:blue:0',
                'kind' => 'belt',
                'belt' => 'blue',
                'from_belt' => 'white',
                'from_stripes' => null,
                'to_stripes' => null,
                'after' => ['promotion_id' => 12, 'recorded_at' => '2024-03-12'],
                'before' => null,
                'completes_promotion_id' => 15,
            ],
        ]);
});

it('finds nothing in a complete history', function (): void {
    $result = gapsOf([
        stripeRow(1, Belt::White, 3, 4, '2025-09-10'),
        beltRow(2, Belt::White, Belt::Blue, '2025-12-20'),
        stripeRow(3, Belt::Blue, 0, 1, '2026-02-01'),
        stripeRow(4, Belt::Blue, 1, 2, '2026-06-15'),
    ], Belt::Blue, 2);

    expect($result['gaps'])->toBe([]);
});

it('finds the stripe missing between a belt and a later stripe', function (): void {
    $result = gapsOf([
        stripeRow(1, Belt::White, 3, 4, '2025-09-10'),
        beltRow(2, Belt::White, Belt::Blue, '2025-12-20'),
        stripeRow(3, Belt::Blue, 1, 2, '2026-06-15'),
    ], Belt::Blue, 2);

    expect(keysOf($result))->toBe(['stripe:blue:1'])
        ->and($result['gaps'][0]['after'])->toBe(['promotion_id' => 2, 'recorded_at' => '2025-12-20'])
        ->and($result['gaps'][0]['before'])->toBe(['promotion_id' => 3, 'recorded_at' => '2026-06-15']);
});

it('walks from the last row to the belt and stripes the athlete holds today', function (): void {
    $result = gapsOf([beltRow(1, Belt::White, Belt::Blue, '2024-01-10')], Belt::Blue, 2);

    expect(keysOf($result))->toBe(['stripe:blue:1', 'stripe:blue:2'])
        ->and(array_column($result['gaps'], 'before'))->toBe([null, null]);
});

it('reads a judo dan and an adult judoka climbing past the half belts', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Yellow, '2010-05-01'),
        beltRow(2, Belt::Orange, Belt::Green, '2012-05-01'),
        beltRow(3, Belt::Brown, Belt::Black, '2015-05-01'),
        stripeRow(4, Belt::Black, 0, 1, '2018-05-01'),
    ], Belt::Black, 3, MartialArt::Judo);

    // Yellow to orange missing; blue and brown between green and black; 3rd
    // and 4th dan (stored 2 and 3) after the 2nd.
    expect(keysOf($result))->toBe([
        'belt:orange:0',
        'belt:blue:0',
        'belt:brown:0',
        'stripe:black:2',
        'stripe:black:3',
    ]);
});

it('reads a taekwondo poom as the child it was, and carries it into the dan', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::Red, Belt::RedAndBlack, '2020-05-01'),
        stripeRow(2, Belt::BlackAndRed, 0, 1, '2022-05-01'),
        beltRow(3, Belt::BlackAndRed, Belt::Black, '2024-05-01'),
    ], Belt::Black, 1, MartialArt::Taekwondo, static fn (Belt $belt, CarbonImmutable $on): bool => $on->lessThan('2024-01-01'));

    // The 1st poom was never written down; 2nd poom became 2nd dan (stored 1).
    expect(keysOf($result))->toBe(['belt:black-and-red:0']);
});

it("walks a child's kids' grades, and gives up rather than guess when the ladder cannot get there", function (): void {
    $records = [
        beltRow(1, Belt::White, Belt::Grey, '2020-05-01'),
        beltRow(2, Belt::Yellow, Belt::Orange, '2023-05-01'),
    ];

    $asChild = gapsOf($records, Belt::Orange, 0, kids: static fn (Belt $belt, CarbonImmutable $on): bool => true);
    $asAdult = gapsOf($records, Belt::Orange, 0);

    expect(keysOf($asChild))->toBe([
        'stripe:grey:1', 'stripe:grey:2', 'stripe:grey:3', 'stripe:grey:4',
        'belt:yellow:0',
        'stripe:yellow:1', 'stripe:yellow:2', 'stripe:yellow:3', 'stripe:yellow:4',
    ])
        // An adult's ladder never passes through orange: no guess.
        ->and(keysOf($asAdult))->toBe([]);
});

it('leaves out a step the owner said never happened', function (): void {
    $result = gapsOf([
        stripeRow(12, Belt::White, 2, 3, '2024-03-12'),
        beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00'),
    ], Belt::Blue, 0, skipped: ['white:4']);

    expect(keysOf($result))->toBe(['belt:blue:0']);
});

it('emits nothing for an interval the ladder cannot walk', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::Blue, Belt::Purple, '2024-01-01'),
        stripeRow(2, Belt::White, 2, 3, '2025-01-01'),
    ], Belt::White, 3);

    expect($result['gaps'])->toBe([])
        ->and($result['history_starts_at'])->toBe('2024-01-01');
});

it('takes the stripes an athlete was entered with as history before the record', function (): void {
    // Entered on blue: whatever stripes they had then were never Budojo's.
    expect(keysOf(gapsOf([beltRow(1, null, Belt::Blue, '2024-01-10')], Belt::Blue, 2)))->toBe([])
        ->and(keysOf(gapsOf([
            beltRow(1, null, Belt::Blue, '2024-01-10'),
            stripeRow(2, Belt::Blue, 2, 3, '2025-01-10'),
        ], Belt::Blue, 3)))->toBe([])
        // A later belt that skipped one still shows the belt that is missing.
        ->and(keysOf(gapsOf([
            beltRow(1, null, Belt::Blue, '2024-01-10'),
            stripeRow(2, Belt::Purple, 0, 1, '2025-01-10'),
        ], Belt::Purple, 1)))->toBe(['belt:purple:0']);
});

it('ignores the stripe reset a live promotion writes beside the belt', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Blue, '2022-01-01'),
        stripeRow(2, Belt::Blue, 0, 1, '2022-06-01'),
        stripeRow(3, Belt::Blue, 1, 2, '2022-12-01'),
        stripeRow(4, Belt::Blue, 2, 3, '2023-06-01'),
        stripeRow(5, Belt::Blue, 3, 4, '2023-12-01'),
        stripeRow(7, Belt::Purple, 4, 0, '2024-06-01 18:42:00'),
        beltRow(6, Belt::Blue, Belt::Purple, '2024-06-01 18:42:00'),
    ], Belt::Purple, 0);

    expect($result['gaps'])->toBe([]);
});

it('orders rows written on the same day by the ladder, not by the order they were typed', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Blue, '2024-01-01'),
        stripeRow(10, Belt::Blue, 1, 2, '2025-01-01'),
        stripeRow(11, Belt::Blue, 0, 1, '2025-01-01'),
    ], Belt::Blue, 2);

    expect($result['gaps'])->toBe([]);
});

it("bounds a gap by the next real row, never by a live promotion's stripe reset", function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Blue, '2022-01-01 10:00:00'),
        stripeRow(2, Belt::Blue, 4, 0, '2022-01-01 10:00:00'),
        stripeRow(3, Belt::Blue, 1, 2, '2023-05-01'),
    ], Belt::Blue, 2);

    expect(keysOf($result))->toBe(['stripe:blue:1'])
        ->and($result['gaps'][0]['after'])->toBe(['promotion_id' => 1, 'recorded_at' => '2022-01-01'])
        ->and($result['gaps'][0]['before'])->toBe(['promotion_id' => 3, 'recorded_at' => '2023-05-01']);
});

it('lets one row cover every step it jumps: a stripe row 1 → 3', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Blue, '2022-01-01'),
        stripeRow(2, Belt::Blue, 1, 3, '2023-05-01'),
    ], Belt::Blue, 3);

    expect(keysOf($result))->toBe(['stripe:blue:1']);
});

it('lets one row cover every step it jumps: a judo double promotion', function (): void {
    $result = gapsOf([
        beltRow(1, Belt::White, Belt::Yellow, '2010-05-01'),
        beltRow(2, Belt::Yellow, Belt::Green, '2012-05-01'),
    ], Belt::Green, 0, MartialArt::Judo);

    expect($result['gaps'])->toBe([]);
});

it('ends a completing step before the next real row, when a later-dated starting row is out of order', function (): void {
    // Opened on white in 2015; imported on blue in 2026; a blue stripe from
    // 2020 backfilled since. The blue belt came before that stripe.
    $result = gapsOf([
        beltRow(1, null, Belt::White, '2015-01-01'),
        beltRow(15, null, Belt::Blue, '2026-01-10'),
        stripeRow(20, Belt::Blue, 0, 1, '2020-05-01'),
    ], Belt::Blue, 1);

    expect($result['gaps'])->toHaveCount(1)
        ->and($result['gaps'][0]['key'])->toBe('belt:blue:0')
        ->and($result['gaps'][0]['completes_promotion_id'])->toBe(15)
        ->and($result['gaps'][0]['after'])->toBe(['promotion_id' => 1, 'recorded_at' => '2015-01-01'])
        ->and($result['gaps'][0]['before'])->toBe(['promotion_id' => 20, 'recorded_at' => '2020-05-01']);
});

it('takes the stripes Jacopo was entered with as held on arrival, whatever came before', function (): void {
    $result = gapsOf([
        stripeRow(12, Belt::White, 2, 3, '2024-03-12'),
        beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00'),
    ], Belt::Blue, 2);

    // Exactly the two steps; no blue stripe dated before the blue itself.
    expect(keysOf($result))->toBe(['stripe:white:4', 'belt:blue:0'])
        ->and($result['gaps'][1]['before'])->toBeNull();
});

it('never offers a belt the history already has a row for', function (): void {
    // A white stripe backfilled after the day he was entered on blue: the
    // history contradicts itself, and no blue belt is offered to fix it.
    $result = gapsOf([
        beltRow(15, null, Belt::Blue, '2026-09-20'),
        stripeRow(12, Belt::White, 2, 3, '2026-09-25'),
    ], Belt::Blue, 0);

    expect($result['gaps'])->toBe([]);
});

it('drops a step that has no day left to go on', function (): void {
    $result = gapsOf([
        stripeRow(1, Belt::White, 1, 2, '2024-01-01'),
        stripeRow(2, Belt::White, 3, 4, '2024-01-01 10:00:00'),
    ], Belt::White, 4);

    expect($result['gaps'])->toBe([]);
});

it('never lets a starting row be skipped: it is completed', function (): void {
    $result = gapsOf([
        stripeRow(12, Belt::White, 2, 3, '2024-03-12'),
        beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00'),
    ], Belt::Blue, 0, skipped: ['blue:0', 'white:4']);

    expect(keysOf($result))->toBe(['belt:blue:0']);
});

/**
 * Fills every ghost row the history offers, one at a time, the way the page
 * does — exactly its fields, on a date inside its window — until none is left.
 *
 * @param list<PromotionRecord> $records
 *
 * @return list<PromotionRecord>
 */
function fillEveryGap(array $records, Belt $belt, int $stripes, MartialArt $art, bool $lastFirst, bool $latestDate): array
{
    $today = CarbonImmutable::parse('2026-09-26');
    $nextId = 1000;

    for ($round = 0; $round < 40; $round++) {
        $gaps = gapsOf($records, $belt, $stripes, $art)['gaps'];
        if ($gaps === []) {
            return $records;
        }

        $gap = $lastFirst ? $gaps[count($gaps) - 1] : $gaps[0];
        $floor = CarbonImmutable::parse($gap['after']['recorded_at'] ?? '2000-01-01')->addDay();
        $ceiling = CarbonImmutable::parse($gap['before']['recorded_at'] ?? $today->toDateString());
        $on = $latestDate ? $ceiling : $floor;
        expect($on->lessThanOrEqualTo($ceiling))->toBeTrue("{$gap['key']} has an empty window");

        $fields = $gap['kind'] === 'belt'
            ? ['kind' => 'belt', 'from_belt' => $gap['from_belt'], 'to_belt' => $gap['belt'], 'completes' => $gap['completes_promotion_id']]
            : ['kind' => 'stripe', 'belt_at_event' => $gap['belt'], 'from_stripes' => $gap['from_stripes'], 'to_stripes' => $gap['to_stripes']];
        expect(PromotionGaps::admits($gaps, $fields, $on->toDateString(), $today))->toBeTrue("{$gap['key']} refused on {$on->toDateString()}");

        $filled = $gap['kind'] === 'stripe'
            ? stripeRow($nextId++, Belt::from($gap['belt']), (int) $gap['from_stripes'], (int) $gap['to_stripes'], $on->toDateString())
            : beltRow($gap['completes_promotion_id'] ?? $nextId++, Belt::from((string) $gap['from_belt']), Belt::from($gap['belt']), $on->toDateString());
        $records = [
            ...array_values(array_filter($records, static fn (PromotionRecord $r): bool => $r->id !== $gap['completes_promotion_id'])),
            $filled,
        ];

        $belts = array_map(
            static fn (PromotionRecord $r): string => $r->belt()->value,
            array_values(array_filter($records, static fn (PromotionRecord $r): bool => $r->kind === 'belt')),
        );
        expect(array_count_values($belts))->each->toBe(1);
    }

    throw new RuntimeException('The gaps never ran out.');
}

it('can never be led into a second row on a belt, whatever the order and the dates', function (array $records, Belt $belt, int $stripes, MartialArt $art): void {
    foreach ([[false, false], [false, true], [true, false], [true, true]] as [$lastFirst, $latestDate]) {
        $filled = fillEveryGap($records, $belt, $stripes, $art, $lastFirst, $latestDate);

        expect(gapsOf($filled, $belt, $stripes, $art)['gaps'])->toBe([]);
    }
})->with([
    'Jacopo, blue' => [[stripeRow(12, Belt::White, 2, 3, '2024-03-12'), beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00')], Belt::Blue, 0, MartialArt::Bjj],
    'Jacopo, blue with two stripes' => [[stripeRow(12, Belt::White, 2, 3, '2024-03-12'), beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00')], Belt::Blue, 2, MartialArt::Bjj],
    'a starting row out of order' => [[beltRow(1, null, Belt::White, '2015-01-01'), beltRow(15, null, Belt::Blue, '2026-01-10'), stripeRow(20, Belt::Blue, 0, 1, '2020-05-01')], Belt::Blue, 1, MartialArt::Bjj],
    'imported on purple, one white stripe known' => [[stripeRow(3, Belt::White, 0, 1, '2016-02-01'), beltRow(9, null, Belt::Purple, '2026-09-01')], Belt::Purple, 2, MartialArt::Bjj],
    'a judoka imported on black' => [[beltRow(1, Belt::White, Belt::Yellow, '2005-01-01'), beltRow(9, null, Belt::Black, '2026-09-01')], Belt::Black, 1, MartialArt::Judo],
]);

it('has no history, and no gaps, without a single row', function (): void {
    expect(gapsOf([], Belt::Blue, 2))->toBe(['gaps' => [], 'history_starts_at' => null]);
});

it('admits a row that fills a gap exactly, inside its window', function (): void {
    $gaps = gapsOf([
        stripeRow(12, Belt::White, 2, 3, '2024-03-12'),
        beltRow(15, null, Belt::Blue, '2026-09-26 10:00:00'),
    ], Belt::Blue, 0)['gaps'];
    $today = CarbonImmutable::parse('2026-09-26');
    $fourth = ['kind' => 'stripe', 'belt_at_event' => 'white', 'from_stripes' => 3, 'to_stripes' => 4];

    expect(PromotionGaps::admits($gaps, $fourth, '2025-05-01', $today))->toBeTrue()
        ->and(PromotionGaps::admits($gaps, $fourth, '2026-09-26', $today))->toBeTrue()
        // The window's own edges: after the row before, not after the one after.
        ->and(PromotionGaps::admits($gaps, $fourth, '2024-03-12', $today))->toBeFalse()
        ->and(PromotionGaps::admits($gaps, $fourth, '2026-09-27', $today))->toBeFalse()
        ->and(PromotionGaps::admits($gaps, [...$fourth, 'to_stripes' => 3], '2025-05-01', $today))->toBeFalse()
        // The belt step is the starting row's to complete, never a second row.
        ->and(PromotionGaps::admits($gaps, ['kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'blue'], '2025-05-01', $today))->toBeFalse()
        ->and(PromotionGaps::admits($gaps, ['kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'blue', 'completes' => 15], '2025-05-01', $today))->toBeTrue();
});
