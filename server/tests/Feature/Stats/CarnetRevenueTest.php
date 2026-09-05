<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update([
        'monthly_fee_cents' => 5500,
        'carnet_price_cents' => 7000,
        'carnet_entries' => 10,
    ]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

/** @return array<string, int> month key => amount */
function revenueByMonth(mixed $test, int $months): array
{
    return collect($test->actingAs($test->user)
        ->getJson("/api/v1/stats/payments/monthly?months={$months}")
        ->assertOk()
        ->json('data'))
        ->mapWithKeys(fn (array $row): array => [$row['month'] => $row['amount_cents']])
        ->all();
}

function sellCarnet(mixed $test, Athlete $athlete, string $validFrom): void
{
    $test->actingAs($test->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/carnets", [
            'purchased_at' => $validFrom,
            'valid_from' => $validFrom,
        ])
        ->assertCreated();
}

it('spreads a carnet across the twelve months it is valid for', function (): void {
    $this->travelTo('2026-12-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    $revenue = revenueByMonth($this, 6);

    // €70 over twelve months is €5.83 a month, with the remainder on the
    // first: 4 cents over, so September carries 587 and the rest 583.
    expect($revenue['2026-09'])->toBe(587)
        ->and($revenue['2026-10'])->toBe(583)
        ->and($revenue['2026-11'])->toBe(583)
        ->and($revenue['2026-12'])->toBe(583)
        // The window opens in September; August predates it.
        ->and($revenue['2026-08'])->toBe(0);
});

it('adds up to exactly what the academy took', function (): void {
    $this->travelTo('2027-09-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    // The whole validity window plus a month either side.
    $total = array_sum(revenueByMonth($this, 14));

    expect($total)->toBe(7000);
});

it('gives the expiry month itself nothing', function (): void {
    $this->travelTo('2027-10-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    $revenue = revenueByMonth($this, 3);

    // Valid 1 Sep 2026 to 1 Sep 2027 is the twelve months September to
    // August; September 2027 is the day it dies, not a month it pays for.
    expect($revenue['2027-08'])->toBe(583)
        ->and($revenue['2027-09'])->toBe(0)
        ->and($revenue['2027-10'])->toBe(0);
});

it('counts a carnet whose window opened before the chart does', function (): void {
    $this->travelTo('2027-03-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    // The window is Jan-Mar 2027 and the carnet was sold in September — a
    // query that only looked for sales inside the window would miss it, and
    // the owner would see nothing for months they are plainly covered.
    $revenue = revenueByMonth($this, 3);

    expect($revenue['2027-01'])->toBe(583)
        ->and($revenue['2027-02'])->toBe(583)
        ->and($revenue['2027-03'])->toBe(583);
});

it('adds carnet money to the monthly fee rather than replacing it', function (): void {
    $this->travelTo('2026-09-15');
    sellCarnet($this, $this->athlete, '2026-09-01');
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 9, 'amount_cents' => 5500,
    ]);

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(5500 + 587);
});

it('never counts another academy carnets', function (): void {
    $this->travelTo('2026-09-15');
    $foreign = Athlete::factory()->create();
    $foreign->academy->update(['carnet_price_cents' => 7000, 'carnet_entries' => 10]);
    $foreign->carnets()->create([
        'code' => 'ZZ99',
        'total_entries' => 10,
        'price_cents' => 7000,
        'purchased_at' => '2026-09-01',
        'valid_from' => '2026-09-01',
        'expires_at' => '2027-09-01',
    ]);

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(0);
});

it('takes a deleted carnet back out of the figures', function (): void {
    $this->travelTo('2026-09-15');
    sellCarnet($this, $this->athlete, '2026-09-01');
    $carnetId = $this->athlete->carnets()->value('id');

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(587);

    // A carnet created by mistake is deletable since #1380, and the money it
    // never really took must not stay in the chart.
    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnetId}")
        ->assertNoContent();

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(0);
});
