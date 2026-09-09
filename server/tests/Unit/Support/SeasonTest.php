<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Support\Season;
use Carbon\CarbonImmutable;

function academyStartingIn(?int $month): Academy
{
    // Unsaved on purpose — Season reads one attribute and touches no relation,
    // so this stays a unit test rather than a database one.
    return new Academy(['season_start_month' => $month]);
}

it('puts a date after the boundary in the season that just started', function (): void {
    $start = Season::startFor(academyStartingIn(9), CarbonImmutable::create(2025, 11, 4));

    expect($start->toDateString())->toBe('2025-09-01');
});

it('puts a date before the boundary in the season that started last year', function (): void {
    // The case the whole class exists for: March is in the season that began
    // the previous September, not the one that has not happened yet.
    $start = Season::startFor(academyStartingIn(9), CarbonImmutable::create(2026, 3, 15));

    expect($start->toDateString())->toBe('2025-09-01');
});

it('counts the boundary day itself as the new season', function (): void {
    $start = Season::startFor(academyStartingIn(9), CarbonImmutable::create(2026, 9, 1));

    expect($start->toDateString())->toBe('2026-09-01');
});

it('falls back to September when the academy has never chosen', function (): void {
    $start = Season::startFor(academyStartingIn(null), CarbonImmutable::create(2026, 3, 15));

    expect($start->toDateString())->toBe('2025-09-01');
});

it('ends the day before the next one starts', function (): void {
    $end = Season::endFor(academyStartingIn(9), CarbonImmutable::create(2026, 3, 15));

    expect($end->toDateString())->toBe('2026-08-31');
});

it('handles a leap February inside the season', function (): void {
    // 2024 was a leap year: the season starting 1 March 2023 ends 29 February.
    $end = Season::endFor(academyStartingIn(3), CarbonImmutable::create(2023, 6, 1));

    expect($end->toDateString())->toBe('2024-02-29');
});

it('labels a season that crosses new year with both years', function (): void {
    $label = Season::labelFor(academyStartingIn(9), CarbonImmutable::create(2026, 3, 15));

    expect($label)->toBe('2025/26');
});

it('labels a calendar-year season with one year', function (): void {
    // January to December never crosses a new year, and "2026/26" would be
    // nonsense on the screen.
    $label = Season::labelFor(academyStartingIn(1), CarbonImmutable::create(2026, 3, 15));

    expect($label)->toBe('2026');
});

it('labels a season crossing a decade without losing the century', function (): void {
    $label = Season::labelFor(academyStartingIn(9), CarbonImmutable::create(2029, 11, 1));

    expect($label)->toBe('2029/30');
});
