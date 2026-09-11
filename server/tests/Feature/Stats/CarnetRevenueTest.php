<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;

/**
 * Carnets on the revenue chart, booked whole in the month they were SOLD
 * (#1553).
 *
 * They were spread across the validity window until then, on the reasoning
 * that a pack is bought for the whole of it. True, and it made a sale
 * invisible: selling a €70 twelve-month carnet moved the chart by €5.83, and
 * an owner who had just taken €70 could not find it anywhere.
 *
 * A carnet is a lump the academy either took or did not. A fee is an
 * entitlement that accrues. Those are different things and they get different
 * rules — which is a thing a reader cannot infer, so the hint under the chart
 * says it too.
 */

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

function sellCarnet(mixed $test, Athlete $athlete, string $purchasedAt, ?string $validFrom = null): void
{
    $test->actingAs($test->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/carnets", [
            'purchased_at' => $purchasedAt,
            'valid_from' => $validFrom ?? $purchasedAt,
        ])
        ->assertCreated();
}

it('books a carnet whole, in the month it was sold', function (): void {
    $this->travelTo('2026-12-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    $revenue = revenueByMonth($this, 6);

    // The whole €70 lands in September and nowhere else. It used to be €5.87
    // there and €5.83 in each of eleven more months.
    expect($revenue['2026-09'])->toBe(7000)
        ->and($revenue['2026-10'])->toBe(0)
        ->and($revenue['2026-11'])->toBe(0)
        ->and($revenue['2026-12'])->toBe(0)
        ->and($revenue['2026-08'])->toBe(0);
});

it('adds up to exactly what the academy took', function (): void {
    $this->travelTo('2027-09-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    $total = array_sum(revenueByMonth($this, 14));

    expect($total)->toBe(7000);
});

it('follows the sale date, not the validity window', function (): void {
    // Bought in August to start in September — a common thing to do, and the
    // money arrived in August.
    $this->travelTo('2026-10-15');
    sellCarnet($this, $this->athlete, '2026-08-20', '2026-09-01');

    $revenue = revenueByMonth($this, 4);

    expect($revenue['2026-08'])->toBe(7000)
        ->and($revenue['2026-09'])->toBe(0);
});

it('drops out of the chart once the sale falls off the left edge', function (): void {
    // Sold in September, asked for the last three months in March. The sale
    // is outside the window and there is nothing to show — which is right:
    // the money was taken, it was just taken before the chart starts.
    $this->travelTo('2027-03-15');
    sellCarnet($this, $this->athlete, '2026-09-01');

    $revenue = revenueByMonth($this, 3);

    expect(array_sum($revenue))->toBe(0);
});

it('adds carnet money to the monthly fee rather than replacing it', function (): void {
    $this->travelTo('2026-09-15');
    sellCarnet($this, $this->athlete, '2026-09-01');
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 9, 'amount_cents' => 5500,
    ]);

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(5500 + 7000);
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

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(7000);

    // A carnet created by mistake is deletable since #1380, and the money it
    // never really took must not stay in the chart.
    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnetId}")
        ->assertNoContent();

    expect(revenueByMonth($this, 1)['2026-09'])->toBe(0);
});

it('does not move when only the validity window is re-dated', function (): void {
    // Re-dating the window moves what the carnet is good for (#1380). It does
    // not move when the academy was paid, so the chart must not follow it —
    // which is the whole difference between the old rule and this one.
    $this->travelTo('2026-12-15');
    sellCarnet($this, $this->athlete, '2026-11-01');
    $carnetId = $this->athlete->carnets()->value('id');

    expect(revenueByMonth($this, 4)['2026-11'])->toBe(7000);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnetId}", [
            'valid_from' => '2026-09-01',
        ])
        ->assertOk();

    $after = revenueByMonth($this, 4);
    expect($after['2026-11'])->toBe(7000)
        ->and($after['2026-09'])->toBe(0);
});

it('shows the months a fee has already paid for, past today (#1553)', function (): void {
    // The defect the owner reported: a €240 quarterly paid in September showed
    // €80, and the other €160 appeared on no bar at all — the window stopped
    // at the current month, so the slices landing in October and November had
    // nowhere to go. The last bar, the one anyone actually looks at, was
    // always a fraction of what came in.
    $this->travelTo('2026-09-15');
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 9, 'period_months' => 3, 'amount_cents' => 24000,
    ]);

    $revenue = revenueByMonth($this, 12);

    expect($revenue['2026-09'])->toBe(8000)
        ->and($revenue['2026-10'])->toBe(8000)
        ->and($revenue['2026-11'])->toBe(8000)
        // And the bars now sum to what the academy was actually paid.
        ->and(array_sum($revenue))->toBe(24000);
});

it('marks the months past today as future', function (): void {
    $this->travelTo('2026-09-15');
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 9, 'period_months' => 3, 'amount_cents' => 24000,
    ]);

    $rows = collect($this->actingAs($this->user)
        ->getJson('/api/v1/stats/payments/monthly?months=12')
        ->assertOk()
        ->json('data'))
        ->mapWithKeys(fn (array $r): array => [$r['month'] => $r['future']])
        ->all();

    // Already collected, not yet earned — the SPA draws these lighter.
    expect($rows['2026-09'])->toBeFalse()
        ->and($rows['2026-10'])->toBeTrue()
        ->and($rows['2026-11'])->toBeTrue();
});

it('stops at the current month when nothing reaches past it', function (): void {
    $this->travelTo('2026-09-15');
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 9, 'period_months' => 1, 'amount_cents' => 8000,
    ]);

    $revenue = revenueByMonth($this, 12);

    // Twelve buckets, no more: the extension is driven by the data, not bolted
    // on. A chart with empty months hanging off its right edge would be its
    // own kind of lie.
    expect($revenue)->toHaveCount(12)
        ->and(array_key_last($revenue))->toBe('2026-09');
});
