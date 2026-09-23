<?php

declare(strict_types=1);

use App\Http\Controllers\Athlete\AthleteController;
use App\Support\MartialArt\RankLadder;

/**
 * The roster's belt sort is a literal CASE with a fixed number of `WHEN ?`
 * placeholders, filled from the academy's ladder (#1800). This replaced
 * `BeltRankSqlSyncTest`, which kept a hand-written list of ranks in step with
 * an enum: there is no list left to drift, only the shape, and the shape is
 * what this pins.
 */
it('has room for the longest ladder, in both directions, with an ELSE above every rank', function (): void {
    foreach (['BELT_RANK_ASC' => 'ASC', 'BELT_RANK_DESC' => 'DESC'] as $name => $direction) {
        $sql = new ReflectionClassConstant(AthleteController::class, $name)->getValue();
        expect($sql)->toBeString();

        preg_match_all('/WHEN \? THEN (\d+)/', (string) $sql, $whens);
        expect($whens[1])->toBe(array_map('strval', range(1, RankLadder::MAX_GRADES)), $name);

        expect(preg_match('/ELSE (\d+) END ' . $direction . '$/', (string) $sql, $else))->toBe(1, $name)
            ->and((int) $else[1])->toBeGreaterThan(RankLadder::MAX_GRADES);
    }
});
