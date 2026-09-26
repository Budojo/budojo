<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use App\Models\User;
use App\Support\CarnetAvailability;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

/**
 * Who is behind, since when, and by how much (#1760).
 *
 * Today is 20 September 2026, and the academy has kept its fees in Budojo
 * since March. September itself is never arrears: it belongs to the unpaid
 * chip, which waits until the 16th for exactly this reason.
 */
beforeEach(function (): void {
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 9, 20));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['monthly_fee_cents' => 5500, 'billing_from' => '2026-03-01']);
});

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

function arrearsAthlete(object $test, string $joined, array $state = []): Athlete
{
    return Athlete::factory()->for($test->academy)->create([
        'joined_at' => $joined,
        'fee_tier_id' => null,
        'fee_override_cents' => null,
        ...$state,
    ]);
}

function arrearsPaid(Athlete $athlete, int $year, int $month, int $period = 1): void
{
    AthletePayment::factory()->for($athlete)->create([
        'year' => $year,
        'month' => $month,
        'period_months' => $period,
        'amount_cents' => 5500 * $period,
    ]);
}

/** @return list<array<string, mixed>> */
function arrearsRows(object $test): array
{
    Sanctum::actingAs($test->user);

    return $test->getJson('/api/v1/stats/payments/arrears')->assertOk()->json('data');
}

/** @return array<string, mixed>|null */
function arrearsRowOf(array $rows, Athlete $athlete): ?array
{
    return collect($rows)->first(fn (array $row): bool => $row['athlete']['id'] === $athlete->id);
}

it('counts the unpaid months from the academy\'s billing floor, never from 2019', function (): void {
    $marco = arrearsAthlete($this, '2019-01-10');
    arrearsPaid($marco, 2026, 4);
    arrearsPaid($marco, 2026, 6);

    $row = arrearsRowOf(arrearsRows($this), $marco);

    // March, May, July, August — without the floor this reads 80 months.
    expect($row)->not->toBeNull()
        ->and($row['months_behind'])->toBe(4)
        ->and($row['first_unpaid'])->toBe('2026-03')
        ->and($row['owed_cents'])->toBe(22000)
        ->and($row['athlete']['first_name'])->toBe($marco->first_name)
        ->and($row['athlete'])->toHaveKey('belt');
});

it('counts from the athlete\'s joining month when that is later', function (): void {
    $luca = arrearsAthlete($this, '2026-06-05');

    $row = arrearsRowOf(arrearsRows($this), $luca);

    // June, July, August: joined in June, and September is not arrears.
    expect($row['months_behind'])->toBe(3)
        ->and($row['first_unpaid'])->toBe('2026-06')
        ->and($row['owed_cents'])->toBe(16500);
});

it('never counts the current month', function (): void {
    $new = arrearsAthlete($this, '2026-09-01');

    expect(arrearsRowOf(arrearsRows($this), $new))->toBeNull();
});

it('lets a payment period cover every month it spans', function (): void {
    $anna = arrearsAthlete($this, '2026-06-01');
    arrearsPaid($anna, 2026, 7, 3); // July to September

    $row = arrearsRowOf(arrearsRows($this), $anna);

    expect($row['months_behind'])->toBe(1)
        ->and($row['first_unpaid'])->toBe('2026-06');
});

it('counts a month a carnet was spendable in as paid, even though it has expired since', function (): void {
    $elena = arrearsAthlete($this, '2026-08-01');
    Carnet::factory()->for($elena)->create([
        'purchased_at' => '2026-08-01',
        'valid_from' => '2026-08-01',
        'expires_at' => '2026-08-31',
    ]);

    // Tested against today, the expired carnet would leave August owed.
    expect(arrearsRowOf(arrearsRows($this), $elena))->toBeNull();
});

it('does not count a month the carnet had already run out before', function (): void {
    $sara = arrearsAthlete($this, '2026-07-01');
    $carnet = Carnet::factory()->for($sara)->create([
        'total_entries' => 2,
        'purchased_at' => '2026-07-01',
        'valid_from' => '2026-07-01',
        'expires_at' => '2026-08-31',
    ]);
    foreach (['2026-07-06', '2026-07-13'] as $day) {
        $presence = AttendanceRecord::factory()->for($sara)->create(['attended_on' => $day]);
        CarnetEntry::factory()->for($carnet)->create(['attendance_record_id' => $presence->id]);
    }

    $row = arrearsRowOf(arrearsRows($this), $sara);

    // July was paid by the carnet; in August it was still valid but empty.
    expect($row['months_behind'])->toBe(1)
        ->and($row['first_unpaid'])->toBe('2026-08');
});

it('counts a carnet spent out during the month as paying for it', function (): void {
    $pietro = arrearsAthlete($this, '2026-08-01');
    $carnet = Carnet::factory()->for($pietro)->create([
        'total_entries' => 1,
        'purchased_at' => '2026-08-01',
        'valid_from' => '2026-08-01',
        'expires_at' => '2026-10-31',
    ]);
    $presence = AttendanceRecord::factory()->for($pietro)->create(['attended_on' => '2026-08-10']);
    CarnetEntry::factory()->for($carnet)->create(['attendance_record_id' => $presence->id]);

    expect(arrearsRowOf(arrearsRows($this), $pietro))->toBeNull();
});

it('counts a month a carnet began partway through as paid', function (): void {
    // Valid from the 15th: a rule asking about the 1st would miss it.
    $late = arrearsAthlete($this, '2026-08-01');
    Carnet::factory()->for($late)->create([
        'purchased_at' => '2026-08-15',
        'valid_from' => '2026-08-15',
        'expires_at' => '2026-08-31',
    ]);

    expect(arrearsRowOf(arrearsRows($this), $late))->toBeNull();
});

it('counts the month a carnet expired in, and not the one after', function (): void {
    // Expired on the 10th: a whole-month rule would miss August, and a rule
    // ignoring the end of the window would cover September too — which is not
    // arrears, so the athlete joins in July to put a month after it in play.
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 10, 20));
    $early = arrearsAthlete($this, '2026-08-01');
    Carnet::factory()->for($early)->create([
        'purchased_at' => '2026-07-11',
        'valid_from' => '2026-07-11',
        'expires_at' => '2026-08-10',
    ]);

    $row = arrearsRowOf(arrearsRows($this), $early);

    expect($row['months_behind'])->toBe(1)
        ->and($row['first_unpaid'])->toBe('2026-09');
});

it('asks of a month exactly what CarnetAvailability asks of each of its days', function (): void {
    // The SQL rule and the PHP one, held to one answer (the precedent is
    // `scopeSpendableOn` in OwingThisMonthTest): covered in August when some
    // August day finds the carnet in its window with an entry left, counting
    // the entries spent before that day.
    $athlete = arrearsAthlete($this, '2026-01-01');
    $carnet = fn (array $state) => Carnet::factory()->for($athlete)->create([
        'purchased_at' => $state['valid_from'],
        'total_entries' => 2,
        ...$state,
    ]);
    $spend = function (Carnet $c, string ...$days) use ($athlete): void {
        foreach ($days as $day) {
            $presence = AttendanceRecord::factory()->for($athlete)->create(['attended_on' => $day]);
            CarnetEntry::factory()->for($c)->create(['attendance_record_id' => $presence->id]);
        }
    };

    $carnet(['valid_from' => '2026-08-15', 'expires_at' => '2026-09-30']);     // starts mid-month
    $carnet(['valid_from' => '2026-07-01', 'expires_at' => '2026-08-10']);     // ends mid-month
    $carnet(['valid_from' => '2026-08-31', 'expires_at' => '2026-10-31']);     // last day only
    $carnet(['valid_from' => '2026-06-01', 'expires_at' => '2026-07-31']);     // ends the day before
    $carnet(['valid_from' => '2026-09-01', 'expires_at' => '2026-10-31']);     // starts the day after
    $spend($carnet(['valid_from' => '2026-07-01', 'expires_at' => '2026-12-31']), '2026-07-06', '2026-07-31'); // spent before August
    $spend($carnet(['valid_from' => '2026-07-01', 'expires_at' => '2026-12-31']), '2026-07-06', '2026-08-01'); // spent on the 1st
    $spend($carnet(['valid_from' => '2026-08-10', 'expires_at' => '2026-12-31']), '2026-08-20', '2026-08-25'); // spent within
    $spend($carnet(['valid_from' => '2026-07-01', 'expires_at' => '2026-12-31']), '2026-07-06');               // one left

    $bySql = Carnet::query()->spendableDuring(2026, 8)->pluck('id')->sort()->values()->all();

    $august = CarbonImmutable::create(2026, 8, 1);
    $byRule = Carnet::query()->with('entries')->get()
        ->filter(function (Carnet $c) use ($august): bool {
            for ($day = $august; $day->month === 8; $day = $day->addDay()) {
                $asOfDay = $c->replicate();
                // The balance that morning: the entries spent before the day.
                $asOfDay->entries_count = $c->entries->filter(fn (CarnetEntry $e): bool => $e->used_on->lt($day))->count();
                if (CarnetAvailability::isActiveOn($asOfDay, $day)) {
                    return true;
                }
            }

            return false;
        })
        ->pluck('id')->sort()->values()->all();

    expect($bySql)->toBe($byRule)->and($bySql)->toHaveCount(6);
});

it('prices the months at the athlete\'s own fee', function (): void {
    $friend = arrearsAthlete($this, '2026-07-01', ['fee_override_cents' => 3000]);

    expect(arrearsRowOf(arrearsRows($this), $friend)['owed_cents'])->toBe(6000);
});

it('leaves out whoever owes nothing by construction', function (): void {
    $free = arrearsAthlete($this, '2026-03-01', ['fee_override_cents' => 0]);
    $gone = arrearsAthlete($this, '2026-03-01', ['status' => AthleteStatus::Inactive->value]);
    $owner = arrearsAthlete($this, '2026-03-01', ['is_self' => true]);

    $ids = collect(arrearsRows($this))->pluck('athlete.id');

    expect($ids)->not->toContain($free->id)
        ->and($ids)->not->toContain($gone->id)
        ->and($ids)->not->toContain($owner->id);
});

it('leaves out an athlete on a free tier, whom the roster still expects to pay', function (): void {
    // `expectedToPay` keeps a deliberate zero on a tier (the roster draws a
    // chip for it); only the fee-above-zero filter keeps a €0 debt off this list.
    $tier = AcademyFeeTier::factory()->for($this->academy)->create(['amount_cents' => 0]);
    $onFreeTier = arrearsAthlete($this, '2026-03-01', ['fee_tier_id' => $tier->id]);

    expect(arrearsRowOf(arrearsRows($this), $onFreeTier))->toBeNull();
});

it('leaves out everyone at an academy whose flat fee is nothing', function (): void {
    $this->academy->update(['monthly_fee_cents' => 0]);
    arrearsAthlete($this, '2026-03-01');

    expect(arrearsRows($this))->toBe([]);
});

it('falls back to the joining month when the academy has no floor', function (): void {
    $this->academy->update(['billing_from' => null]);
    $old = arrearsAthlete($this, '2026-01-15');

    expect(arrearsRowOf(arrearsRows($this), $old)['months_behind'])->toBe(8);
});

it('puts the longest behind first, then by surname', function (): void {
    $b = arrearsAthlete($this, '2026-07-01', ['first_name' => 'Bea', 'last_name' => 'Bianchi']);
    $a = arrearsAthlete($this, '2026-07-01', ['first_name' => 'Ada', 'last_name' => 'Alberti']);
    $long = arrearsAthlete($this, '2026-03-01', ['first_name' => 'Zeno', 'last_name' => 'Zanetti']);

    $ids = collect(arrearsRows($this))->pluck('athlete.id')->all();

    expect($ids)->toBe([$long->id, $a->id, $b->id]);
});

it('never shows another academy\'s debtors', function (): void {
    $other = userWithAcademy();
    $other->academy->update(['monthly_fee_cents' => 5500, 'billing_from' => '2026-03-01']);
    Athlete::factory()->for($other->academy)->create(['joined_at' => '2026-03-01']);

    expect(arrearsRows($this))->toBe([]);
});

it('asks who is calling', function (): void {
    $this->getJson('/api/v1/stats/payments/arrears')->assertUnauthorized();

    Sanctum::actingAs(User::factory()->create());
    $this->getJson('/api/v1/stats/payments/arrears')->assertForbidden();
});
