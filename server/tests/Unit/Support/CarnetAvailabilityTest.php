<?php

declare(strict_types=1);

use App\Models\Carnet;
use App\Support\CarnetAvailability;
use Carbon\CarbonImmutable;

function carnetWith(int $total, int $spent, string $purchased, string $expires): Carnet
{
    $carnet = new Carnet([
        'total_entries' => $total,
        'purchased_at' => $purchased,
        'expires_at' => $expires,
    ]);
    $carnet->setAttribute('entries_count', $spent);

    return $carnet;
}

it('derives the balance from the ledger count', function (): void {
    expect(CarnetAvailability::remainingEntries(carnetWith(10, 3, '2026-01-01', '2027-01-01')))->toBe(7);
});

it('refuses to guess a balance when the ledger count was not loaded', function (): void {
    // Silently reporting a full carnet would charge the athlete nothing and
    // nobody would notice — better to fail where the mistake was made.
    $carnet = new Carnet(['total_entries' => 10]);

    expect(fn (): int => CarnetAvailability::remainingEntries($carnet))
        ->toThrow(LogicException::class);
});

it('is spendable inside the window with entries left', function (): void {
    $carnet = carnetWith(10, 3, '2026-01-01', '2027-01-01');

    expect(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2026-06-15')))->toBeTrue();
});

it('is spendable on the first and last day of the window', function (): void {
    $carnet = carnetWith(10, 0, '2026-01-01', '2027-01-01');

    expect(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2026-01-01')))->toBeTrue()
        ->and(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2027-01-01')))->toBeTrue();
});

it('is not spendable the day before it was bought or the day after it expired', function (): void {
    $carnet = carnetWith(10, 0, '2026-01-01', '2027-01-01');

    expect(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2025-12-31')))->toBeFalse()
        ->and(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2027-01-02')))->toBeFalse();
});

it('is not spendable once every entry is spent', function (): void {
    $carnet = carnetWith(10, 10, '2026-01-01', '2027-01-01');

    expect(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2026-06-15')))->toBeFalse();
});

it('ignores the time of day on the date being judged', function (): void {
    $carnet = carnetWith(10, 0, '2026-01-01', '2027-01-01');

    expect(CarnetAvailability::isActiveOn($carnet, CarbonImmutable::parse('2027-01-01 23:59:00')))->toBeTrue();
});
