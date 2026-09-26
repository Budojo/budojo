<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use App\Models\User;
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
