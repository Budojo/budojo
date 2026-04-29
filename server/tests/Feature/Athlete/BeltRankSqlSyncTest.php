<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Http\Controllers\Athlete\AthleteController;

it('keeps the AthleteController belt-rank SQL in sync with Belt::rank()', function (): void {
    // Scope the assertion to the applyBeltSort() body so other strings
    // elsewhere in the controller (or in comments) can't satisfy the match
    // by accident.
    $method = new ReflectionMethod(AthleteController::class, 'applyBeltSort');
    $sourcePath = $method->getFileName();
    expect($sourcePath)->toBeString();

    $sourceLines = file($sourcePath);
    expect($sourceLines)->not->toBeFalse();

    $methodSource = implode('', array_slice(
        $sourceLines,
        $method->getStartLine() - 1,
        $method->getEndLine() - $method->getStartLine() + 1,
    ));

    foreach (Belt::cases() as $belt) {
        // Each belt must appear EXACTLY TWICE — once in the ASC CASE, once
        // in the DESC CASE — and both occurrences must encode the same
        // rank as Belt::rank(). Without this, a drift in just one of the
        // two CASE strings would slip through unnoticed.
        $pattern = sprintf("/WHEN '%s' THEN (\\d+)/", preg_quote($belt->value, '/'));
        $matchCount = preg_match_all($pattern, $methodSource, $matches);

        expect($matchCount)->toBe(2, sprintf(
            "AthleteController::applyBeltSort() must encode '%s' exactly twice (ASC + DESC), got %d",
            $belt->value,
            $matchCount,
        ));

        foreach ($matches[1] as $matchedRank) {
            expect((int) $matchedRank)->toBe(
                $belt->rank(),
                "AthleteController::applyBeltSort() has a mismatched rank for {$belt->value}; expected {$belt->rank()} in every CASE branch",
            );
        }
    }

    // Both CASE expressions must carry an explicit ELSE branch. Without
    // it a belt value that fell outside the enum (the column is plain
    // varchar with no CHECK constraint) would sort as NULL — first on
    // ASC, last on DESC — silently hiding the data drift. The ELSE
    // rank must be strictly greater than every legitimate Belt::rank()
    // so unknown rows land at the end on ASC and at the top on DESC,
    // surfaced rather than buried.
    $maxRealRank = max(array_map(fn (Belt $b) => $b->rank(), Belt::cases()));
    $elseCount = preg_match_all('/ELSE (\d+) END (ASC|DESC)/', $methodSource, $elseMatches);

    expect($elseCount)->toBe(2, sprintf(
        'AthleteController::applyBeltSort() must include an ELSE branch in both ASC and DESC CASEs, got %d',
        $elseCount,
    ));

    foreach ($elseMatches[1] as $elseRank) {
        expect((int) $elseRank)->toBeGreaterThan(
            $maxRealRank,
            "ELSE rank {$elseRank} must be strictly greater than the highest enum rank ({$maxRealRank}); otherwise unknown belts collide with real ones",
        );
    }
});
