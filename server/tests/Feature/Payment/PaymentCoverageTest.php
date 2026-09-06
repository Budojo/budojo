<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->travelTo('2026-04-15');
    $this->user = userWithAcademy();
    $this->user->academy->update([
        'monthly_fee_cents' => 5500,
        'carnet_price_cents' => 7000,
        'carnet_entries' => 10,
    ]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

/** The `payment_coverage` the roster serves for the athlete. */
function coverageOnRoster(mixed $test, Athlete $athlete): string
{
    return collect($test->actingAs($test->user)->getJson('/api/v1/athletes')->assertOk()->json('data'))
        ->firstWhere('id', $athlete->id)['payment_coverage'];
}

it('says nothing covers the month when nothing does', function (): void {
    expect(coverageOnRoster($this, $this->athlete))->toBe('none');
});

it('names the period a fee payment covers the month with', function (): void {
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 2, 'period_months' => 3,
    ]);

    // "Paid" alone never said why April was covered by something bought in
    // February.
    expect(coverageOnRoster($this, $this->athlete))->toBe('quarterly');
});

it('says monthly for the ordinary case', function (): void {
    AthletePayment::factory()->for($this->athlete)->create(['year' => 2026, 'month' => 4]);

    expect(coverageOnRoster($this, $this->athlete))->toBe('monthly');
});

it('says carnet for an athlete who bought one and no fee', function (): void {
    // The bug this whole change exists for: Samuele Bruni, eight entries left,
    // reading "Non pagato" on the roster.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-04-01',
            'valid_from' => '2026-04-01',
        ])
        ->assertCreated();

    expect(coverageOnRoster($this, $this->athlete))->toBe('carnet');
});

it('lets the monthly fee win over a carnet, as the ledger already does', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-04-01',
            'valid_from' => '2026-04-01',
        ])
        ->assertCreated();
    AthletePayment::factory()->for($this->athlete)->create(['year' => 2026, 'month' => 4]);

    // Not a new decision: a month covered by a fee charges no carnet entry
    // (#1380), and the roster must summarise that rule rather than invent a
    // second ordering.
    expect(coverageOnRoster($this, $this->athlete))->toBe('monthly');
});

it('says carnet again once the fee for that month is undone', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-04-01',
            'valid_from' => '2026-04-01',
        ])
        ->assertCreated();
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertCreated();

    expect(coverageOnRoster($this, $this->athlete))->toBe('monthly');

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/4")
        ->assertNoContent();

    expect(coverageOnRoster($this, $this->athlete))->toBe('carnet');
});

it('ignores a carnet with nothing left in it', function (): void {
    $this->user->academy->update(['carnet_entries' => 1]);
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-04-01',
            'valid_from' => '2026-04-01',
        ])
        ->assertCreated();
    $this->actingAs($this->user)
        ->postJson('/api/v1/attendance', [
            'athlete_ids' => [$this->athlete->id],
            'date' => '2026-04-08',
        ])
        ->assertCreated();

    // Spent is not covered. `CarnetAvailability` already decides what
    // "spendable" means; this reads it rather than re-deciding.
    expect(coverageOnRoster($this, $this->athlete))->toBe('none');
});

it('serves it on the single-athlete read too, where nothing is pre-loaded', function (): void {
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 1, 'period_months' => 12,
    ]);

    // The resource has two paths — an in-memory filter on the roster and a
    // query on a single row — and they have to agree.
    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.payment_coverage', 'annual');
});

it('keeps paid_current_month meaning what it always meant', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-04-01',
            'valid_from' => '2026-04-01',
        ])
        ->assertCreated();

    // A carnet is not a paid month, and the unpaid widget, the `?paid` filter
    // and both reminders still read this. Widening it here would have changed
    // who gets chased, by accident, in the same commit as a column rename.
    $row = collect($this->actingAs($this->user)->getJson('/api/v1/athletes')->json('data'))
        ->firstWhere('id', $this->athlete->id);

    expect($row['payment_coverage'])->toBe('carnet')
        ->and($row['paid_current_month'])->toBeFalse();
});

it('serves the roster without a query per athlete', function (): void {
    $rosterCost = function (int $athletes): int {
        Athlete::query()->forceDelete();
        Athlete::factory()->count($athletes)->for($this->user->academy)->create();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->user)->getJson('/api/v1/athletes')->assertOk();
        $count = count(DB::getRawQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    // Reading the covering payment instead of an `exists()` must not turn the
    // pre-loaded slice back into a per-row lookup.
    expect($rosterCost(6))->toBe($rosterCost(2));
});
