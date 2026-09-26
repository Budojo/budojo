<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\GradeCount;
use App\Support\MartialArt\Grade;
use App\Support\MartialArt\RankLadder;

function ladderOf(Belt ...$belts): RankLadder
{
    return new RankLadder(array_map(static fn (Belt $b): Grade => new Grade($b, 0), array_values($belts)));
}

it('ranks from one, lowest first', function (): void {
    $ladder = ladderOf(Belt::White, Belt::Yellow, Belt::Black);

    expect($ladder->rankOf(Belt::White))->toBe(1)
        ->and($ladder->rankOf(Belt::Black))->toBe(3);
});

it('has no rank and no cap for a colour it does not award', function (): void {
    $ladder = ladderOf(Belt::White, Belt::Black);

    expect($ladder->has(Belt::Purple))->toBeFalse()
        ->and($ladder->rankOf(Belt::Purple))->toBeNull()
        ->and($ladder->maxStripes(Belt::Purple))->toBeNull();
});

it('binds the sort values in rank order, padded to the SQL with nulls that never match', function (): void {
    $bindings = ladderOf(Belt::White, Belt::Yellow)->sortBindings();

    expect($bindings)->toHaveCount(RankLadder::MAX_GRADES)
        ->and(array_slice($bindings, 0, 3))->toBe(['white', 'yellow', null]);
});

it('starts an adult on the first rung that is not a kids-only step', function (): void {
    $ladder = new RankLadder([new Grade(Belt::Grey, 4, kids: true), new Grade(Belt::White, 4)]);

    expect($ladder->startingBelt())->toBe(Belt::White);
});

it('refuses a ladder that names a belt twice, or that the sort has no room for', function (): void {
    expect(fn () => ladderOf(Belt::White, Belt::White))->toThrow(InvalidArgumentException::class);
    expect(fn () => new RankLadder([]))->toThrow(InvalidArgumentException::class);
    expect(fn () => ladderOf(...array_slice(Belt::cases(), 0, RankLadder::MAX_GRADES + 1)))
        ->toThrow(InvalidArgumentException::class);
});

// ── The next step (#1841) ──────────────────────────────────────────────────

function bjjLikeLadder(): RankLadder
{
    return new RankLadder([
        new Grade(Belt::Grey, 4, kids: true),
        new Grade(Belt::Green, 4, kids: true),
        new Grade(Belt::White, 4),
        new Grade(Belt::Blue, 4),
        new Grade(Belt::Purple, 4),
    ]);
}

it('takes the next stripe while the belt has room for one', function (): void {
    expect(bjjLikeLadder()->nextStep(Belt::Blue, 2, kidsEligible: false))
        ->toBe(['kind' => 'stripe', 'belt' => Belt::Blue, 'stripes' => 3]);
});

it('takes the next belt at the stripe cap, with its stripes back to none', function (): void {
    expect(bjjLikeLadder()->nextStep(Belt::Blue, 4, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Purple, 'stripes' => 0]);
});

it('skips the kids-only grades for someone who is not eligible for them', function (): void {
    $ladder = new RankLadder([
        new Grade(Belt::White, 0),
        new Grade(Belt::WhiteAndYellow, 0, kids: true),
        new Grade(Belt::Yellow, 0),
    ]);

    expect($ladder->nextStep(Belt::White, 0, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Yellow, 'stripes' => 0])
        ->and($ladder->nextStep(Belt::White, 0, kidsEligible: true))
        ->toBe(['kind' => 'belt', 'belt' => Belt::WhiteAndYellow, 'stripes' => 0]);
});

it('climbs the kids grades a ladder lists below the starting belt right after it', function (): void {
    // BJJ lists grey to green below white, but a child starts on white and
    // climbs them from there; green then leads to blue, never back to white.
    $ladder = bjjLikeLadder();

    expect($ladder->nextStep(Belt::White, 4, kidsEligible: true))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Grey, 'stripes' => 0])
        ->and($ladder->nextStep(Belt::Grey, 4, kidsEligible: true))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Green, 'stripes' => 0])
        ->and($ladder->nextStep(Belt::Green, 4, kidsEligible: true))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Blue, 'stripes' => 0])
        ->and($ladder->nextStep(Belt::White, 4, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Blue, 'stripes' => 0]);
});

it('moves someone on a kids grade who is no longer eligible to the next adult grade, stripes left or not', function (): void {
    // IBJJF moves a sixteen-year-old to blue whatever the stripes on the kids'
    // belt; WT turns a poom into a dan at fifteen the same way.
    expect(bjjLikeLadder()->nextStep(Belt::Grey, 4, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Blue, 'stripes' => 0])
        ->and(bjjLikeLadder()->nextStep(Belt::Grey, 1, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Blue, 'stripes' => 0])
        ->and(bjjLikeLadder()->nextStep(Belt::Grey, 1, kidsEligible: true))
        ->toBe(['kind' => 'stripe', 'belt' => Belt::Grey, 'stripes' => 2]);
});

it('turns an outgrown poom into the dan of the same number', function (): void {
    // Kukkiwon: at fifteen a poom converts to the dan of the same degree.
    $ladder = new RankLadder([
        new Grade(Belt::RedAndBlack, 0),
        new Grade(Belt::BlackAndRed, 3, GradeCount::Poom, first: 1, kids: true),
        new Grade(Belt::Black, 8, GradeCount::Dan, first: 1),
    ]);

    expect($ladder->nextStep(Belt::BlackAndRed, 1, kidsEligible: false))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Black, 'stripes' => 1])
        // At the poom cap too: the 4th poom leads to the 4th dan, not the 1st.
        ->and($ladder->nextStep(Belt::BlackAndRed, 3, kidsEligible: true))
        ->toBe(['kind' => 'belt', 'belt' => Belt::Black, 'stripes' => 3]);
});

it('tells a kids grade from an adult one', function (): void {
    expect(bjjLikeLadder()->isKidsGrade(Belt::Green))->toBeTrue()
        ->and(bjjLikeLadder()->isKidsGrade(Belt::White))->toBeFalse()
        ->and(bjjLikeLadder()->isKidsGrade(Belt::Red))->toBeFalse();
});

it('counts a dan the way it counts a stripe', function (): void {
    $ladder = new RankLadder([new Grade(Belt::Brown, 0), new Grade(Belt::Black, 4)]);

    expect($ladder->nextStep(Belt::Black, 2, kidsEligible: false))
        ->toBe(['kind' => 'stripe', 'belt' => Belt::Black, 'stripes' => 3]);
});

it('has no next step at the top of the ladder, nor for a colour it does not award', function (): void {
    expect(bjjLikeLadder()->nextStep(Belt::Purple, 4, kidsEligible: false))->toBeNull()
        ->and(bjjLikeLadder()->nextStep(Belt::Red, 0, kidsEligible: false))->toBeNull();
});
