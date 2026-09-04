<?php

declare(strict_types=1);

use App\Actions\Attendance\MarkAttendanceAction;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Carbon\CarbonImmutable;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->athlete = Athlete::factory()->for($this->academy)->create();
    $this->mark = app(MarkAttendanceAction::class);
});

function markOn(Athlete $athlete, string $date): void
{
    app(MarkAttendanceAction::class)->execute(
        $athlete->academy,
        CarbonImmutable::parse($date),
        [$athlete->id],
    );
}

// ─── Consumption ──────────────────────────────────────────────────────────────

it('charges one entry when the athlete has a carnet and no monthly payment', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
    expect(CarnetEntry::first()->used_on->toDateString())->toBe('2026-03-05');
});

it('charges nothing when the month is covered by the monthly fee', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 3)->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::count())->toBe(0);
});

it('judges monthly coverage against the attended month, not the current one', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
    // Paid for March; the session being back-filled is in April.
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 3)->create();

    markOn($this->athlete, '2026-04-05');

    expect(CarnetEntry::count())->toBe(1);
});

it('does not charge a carnet that had not been purchased yet on the attended date', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn('2026-06-01')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::count())->toBe(0);
});

it('does not charge a carnet that had already expired on the attended date', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn('2024-01-10')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::count())->toBe(0);
});

it('records the presence and charges nothing when the athlete has no coverage at all', function (): void {
    markOn($this->athlete, '2026-03-05');

    expect($this->athlete->attendanceRecords()->count())->toBe(1)
        ->and(CarnetEntry::count())->toBe(0);
});

it('refuses to overdraw a carnet that has no entries left', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create(['total_entries' => 2]);
    CarnetEntry::factory()->count(2)->for($carnet)->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(2);
});

it('burns the carnet expiring first when the athlete holds two', function (): void {
    $expiringSooner = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
    $expiringLater = Carnet::factory()->for($this->athlete)->purchasedOn('2026-02-20')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $expiringSooner->id)->count())->toBe(1)
        ->and(CarnetEntry::where('carnet_id', $expiringLater->id)->count())->toBe(0);
});

it('falls through to the second carnet once the first is exhausted', function (): void {
    $exhausted = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create(['total_entries' => 1]);
    CarnetEntry::factory()->for($exhausted)->create();
    $fresh = Carnet::factory()->for($this->athlete)->purchasedOn('2026-02-20')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $fresh->id)->count())->toBe(1);
});

it('does not charge a second entry when an already-present athlete is re-marked', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();

    markOn($this->athlete, '2026-03-05');
    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
});

// ─── Bulk behaviour ───────────────────────────────────────────────────────────

it('charges each athlete of a bulk mark against their own carnet', function (): void {
    $second = Athlete::factory()->for($this->academy)->create();
    $carnetA = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
    $carnetB = Carnet::factory()->for($second)->purchasedOn('2026-01-10')->create();
    // Covered by the monthly fee — must not be charged even in the bulk path.
    $third = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($third)->purchasedOn('2026-01-10')->create();
    AthletePayment::factory()->for($third)->forYearMonth(2026, 3)->create();

    $this->mark->execute(
        $this->academy,
        CarbonImmutable::parse('2026-03-05'),
        [$this->athlete->id, $second->id, $third->id],
    );

    expect(CarnetEntry::where('carnet_id', $carnetA->id)->count())->toBe(1)
        ->and(CarnetEntry::where('carnet_id', $carnetB->id)->count())->toBe(1)
        ->and(CarnetEntry::count())->toBe(2);
});

it('looks coverage and carnets up once per batch, not once per athlete', function (): void {
    // Measured on the consumption action alone. Going through
    // MarkAttendanceAction would also count the achievement evaluator that
    // AttendanceObserver fires per row — pre-existing behaviour that would
    // drown out the thing under test.
    $consume = app(\App\Actions\Payment\ConsumeCarnetEntriesAction::class);
    $date = CarbonImmutable::parse('2026-03-05');

    $costFor = function (int $athleteCount) use ($consume, $date): int {
        $records = collect();
        foreach (range(1, $athleteCount) as $ignored) {
            $athlete = Athlete::factory()->for($this->academy)->create();
            Carnet::factory()->for($athlete)->purchasedOn('2026-01-10')->create();
            $records->push(\App\Models\AttendanceRecord::create([
                'athlete_id' => $athlete->id,
                'attended_on' => $date->toDateString(),
            ]));
        }

        // flush, not just enable: disableQueryLog() stops recording but keeps
        // what it already recorded, so the second measurement would otherwise
        // include the first one's queries.
        DB::flushQueryLog();
        DB::enableQueryLog();
        $consume->execute($records, $date);
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    $small = $costFor(2);
    $large = $costFor(6);

    // Four more athletes cost exactly four more inserts. If either lookup were
    // inside the loop the delta would be 8 or 12 instead.
    expect($large - $small)->toBe(4);
});
