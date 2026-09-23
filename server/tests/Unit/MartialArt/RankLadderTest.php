<?php

declare(strict_types=1);

use App\Enums\Belt;
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
