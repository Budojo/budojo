<?php

declare(strict_types=1);

use App\Actions\Attendance\MarkAttendanceAction;
use App\Actions\Payment\ReconcileCarnetEntriesAction;
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
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
    expect(CarnetEntry::first()->used_on->toDateString())->toBe('2026-03-05');
});

it('charges nothing when the month is covered by the monthly fee', function (): void {
    Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 3)->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::count())->toBe(0);
});

it('judges monthly coverage against the attended month, not the current one', function (): void {
    Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();
    // Paid for March; the session being back-filled is in April.
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 3)->create();

    markOn($this->athlete, '2026-04-05');

    expect(CarnetEntry::count())->toBe(1);
});

it('charges sessions that predate the sale, once the carnet is dated to cover them', function (): void {
    // The rule this reverses (#1380). It used to read "does not charge a carnet
    // that had not been purchased yet on the attended date", and that is
    // exactly what the owner reported: a carnet sold on the 4th ignored the
    // session on the 2nd. A carnet now covers what its window says it covers,
    // whenever it was sold.
    markOn($this->athlete, '2026-03-05');
    expect(CarnetEntry::count())->toBe(0);

    Carnet::factory()->for($this->athlete)->validFrom('2026-01-01')->create();
    app(ReconcileCarnetEntriesAction::class)->execute([$this->athlete->id]);

    expect(CarnetEntry::count())->toBe(1);
});

it('still ignores a session that falls before the validity window', function (): void {
    // Retroactive is not unlimited: the window is what counts, and a session
    // older than `valid_from` is outside it.
    markOn($this->athlete, '2026-03-05');
    Carnet::factory()->for($this->athlete)->validFrom('2026-06-01')->create();
    app(ReconcileCarnetEntriesAction::class)->execute([$this->athlete->id]);

    expect(CarnetEntry::count())->toBe(0);
});

it('does not charge a carnet that had already expired on the attended date', function (): void {
    Carnet::factory()->for($this->athlete)->validFrom('2024-01-10')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::count())->toBe(0);
});

it('records the presence and charges nothing when the athlete has no coverage at all', function (): void {
    markOn($this->athlete, '2026-03-05');

    expect($this->athlete->attendanceRecords()->count())->toBe(1)
        ->and(CarnetEntry::count())->toBe(0);
});

it('refuses to overdraw a carnet that has no entries left', function (): void {
    // Exhaustion is earned with real sessions: the ledger is derived from
    // attendance, so a pre-seeded entry pointing at someone else's presence
    // would simply be reconciled away. That the old test could fake it was a
    // hole this model closes.
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create(['total_entries' => 2]);

    markOn($this->athlete, '2026-03-05');
    markOn($this->athlete, '2026-03-06');
    markOn($this->athlete, '2026-03-07');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(2);
});

it('gives the first sessions in date order to the carnet, and leaves the rest uncovered', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create(['total_entries' => 1]);

    markOn($this->athlete, '2026-03-07');
    markOn($this->athlete, '2026-03-05');

    // Marked out of order, charged in order: the earlier session is the one
    // that got paid for, whatever sequence the owner entered them in.
    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
    expect(CarnetEntry::firstOrFail()->used_on->toDateString())->toBe('2026-03-05');
});

it('burns the carnet expiring first when the athlete holds two', function (): void {
    $expiringSooner = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();
    $expiringLater = Carnet::factory()->for($this->athlete)->validFrom('2026-02-20')->create();

    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $expiringSooner->id)->count())->toBe(1)
        ->and(CarnetEntry::where('carnet_id', $expiringLater->id)->count())->toBe(0);
});

it('falls through to the second carnet once the first is exhausted', function (): void {
    $first = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create(['total_entries' => 1]);
    $second = Carnet::factory()->for($this->athlete)->validFrom('2026-02-20')->create();

    // February is inside the first carnet's window only, so it takes that one
    // and its single entry is spent; March falls in both and goes to the second.
    markOn($this->athlete, '2026-02-01');
    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $first->id)->count())->toBe(1)
        ->and(CarnetEntry::where('carnet_id', $second->id)->count())->toBe(1);
    expect(CarnetEntry::where('carnet_id', $second->id)->firstOrFail()->used_on->toDateString())
        ->toBe('2026-03-05');
});

it('does not charge a second entry when an already-present athlete is re-marked', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();

    markOn($this->athlete, '2026-03-05');
    markOn($this->athlete, '2026-03-05');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
});

// ─── Bulk behaviour ───────────────────────────────────────────────────────────

it('charges each athlete of a bulk mark against their own carnet', function (): void {
    $second = Athlete::factory()->for($this->academy)->create();
    $carnetA = Carnet::factory()->for($this->athlete)->validFrom('2026-01-10')->create();
    $carnetB = Carnet::factory()->for($second)->validFrom('2026-01-10')->create();
    // Covered by the monthly fee — must not be charged even in the bulk path.
    $third = Athlete::factory()->for($this->academy)->create();
    Carnet::factory()->for($third)->validFrom('2026-01-10')->create();
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

it('reconciles a batch with a constant number of lookups, not one per athlete', function (): void {
    // Measured on the reconciliation alone. Going through MarkAttendanceAction
    // would also count the achievement evaluator that AttendanceObserver fires
    // per row — pre-existing behaviour that would drown out the thing tested.
    $reconcile = app(ReconcileCarnetEntriesAction::class);
    $date = CarbonImmutable::parse('2026-03-05');

    $costFor = function (int $athleteCount) use ($reconcile, $date): int {
        $ids = [];
        foreach (range(1, $athleteCount) as $ignored) {
            $athlete = Athlete::factory()->for($this->academy)->create();
            Carnet::factory()->for($athlete)->validFrom('2026-01-10')->create();
            \App\Models\AttendanceRecord::create([
                'athlete_id' => $athlete->id,
                'attended_on' => $date->toDateString(),
            ]);
            $ids[] = $athlete->id;
        }

        // flush, not just enable: disableQueryLog() stops recording but keeps
        // what it already recorded, so the second measurement would otherwise
        // include the first one's queries.
        DB::flushQueryLog();
        DB::enableQueryLog();
        $reconcile->execute($ids);
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    $small = $costFor(2);
    $large = $costFor(6);

    // Four more athletes cost four more inserts and nothing else: carnets,
    // sessions, payments and the existing ledger are each one query for the
    // whole batch. A per-athlete lookup would make the delta grow much faster.
    expect($large - $small)->toBe(4);
});
