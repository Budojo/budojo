<?php

declare(strict_types=1);

use App\Actions\Stats\PaymentsArrearsAction;
use App\Enums\AthleteStatus;
use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

/**
 * The months an athlete is late on, sent with their payments (#1654).
 *
 * «In ritardo» on the ledger used to be worked out in the browser from what it
 * could see, which was far less than the arrears list (#1760) knows: it called
 * a month late for an athlete with no fee, one on a free tier, a carnet holder,
 * an inactive athlete. The server now says which months are owed, by the same
 * rule as the arrears list, and the two can never disagree.
 *
 * Today is 20 September 2026; fees are kept in Budojo since March.
 */
beforeEach(function (): void {
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 9, 20, 12));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['monthly_fee_cents' => 5500, 'billing_from' => '2026-03-01']);
});

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

function overdueAthlete(object $test, array $state = []): Athlete
{
    return Athlete::factory()->for($test->academy)->create([
        'joined_at' => '2019-01-10',
        'fee_tier_id' => null,
        'fee_override_cents' => null,
        ...$state,
    ]);
}

function overduePaid(Athlete $athlete, int $year, int $month, int $period = 1): void
{
    AthletePayment::factory()->for($athlete)->create([
        'year' => $year,
        'month' => $month,
        'period_months' => $period,
        'amount_cents' => 5500 * $period,
    ]);
}

/** @return list<string> */
function overdueMonthsOf(object $test, Athlete $athlete, int $year = 2026): array
{
    Sanctum::actingAs($test->user);

    return $test->getJson("/api/v1/athletes/{$athlete->id}/payments?year={$year}")
        ->assertOk()
        ->json('overdue_months');
}

it('sends the months the athlete is late on, from the floor to last month', function (): void {
    $marco = overdueAthlete($this);
    overduePaid($marco, 2026, 4);
    overduePaid($marco, 2026, 6);

    // March, May, July, August. Not September: it is this month, not late.
    expect(overdueMonthsOf($this, $marco))->toBe(['2026-03', '2026-05', '2026-07', '2026-08']);
});

it('agrees with the arrears list, month for month', function (): void {
    $marco = overdueAthlete($this);
    overduePaid($marco, 2026, 4);
    overduePaid($marco, 2026, 5, 3);

    $arrears = collect(app(PaymentsArrearsAction::class)->execute($this->academy, OperatorDay::today()))
        ->firstWhere(fn (array $row): bool => $row['athlete']['id'] === $marco->id);
    $overdue = overdueMonthsOf($this, $marco);

    expect($arrears)->not->toBeNull()
        ->and(count($overdue))->toBe($arrears['months_behind'])
        ->and($overdue[0])->toBe($arrears['first_unpaid']);
});

it('says nothing is late for someone who owes nothing', function (string $case): void {
    $athlete = match ($case) {
        'inactive' => overdueAthlete($this, ['status' => AthleteStatus::Inactive]),
        'free tier' => overdueAthlete($this, [
            'fee_tier_id' => AcademyFeeTier::factory()->for($this->academy)->create(['amount_cents' => 0])->id,
        ]),
        'trains free' => overdueAthlete($this, ['fee_override_cents' => 0]),
        default => null,
    };
    if ($case === 'no fee') {
        $this->academy->update(['monthly_fee_cents' => null]);
        $athlete = overdueAthlete($this);
    }

    expect(overdueMonthsOf($this, $athlete))->toBe([]);
})->with(['inactive', 'free tier', 'trains free', 'no fee']);

it('counts a month a carnet paid for as paid', function (): void {
    $elena = overdueAthlete($this);
    // A carnet valid through July and August pays for both.
    Carnet::factory()->for($elena)->validFrom('2026-07-01')->create(['total_entries' => 10]);

    $overdue = overdueMonthsOf($this, $elena);

    expect($overdue)->not->toContain('2026-07')
        ->and($overdue)->not->toContain('2026-08')
        ->and($overdue)->toContain('2026-06');
});

it('only sends the months of the year asked for', function (): void {
    $marco = overdueAthlete($this);

    // The season crosses new year: the table asks for each calendar year.
    // 2025 is before the floor, and 2027 has not come yet.
    expect(overdueMonthsOf($this, $marco, 2025))->toBe([])
        ->and(overdueMonthsOf($this, $marco, 2027))->toBe([]);
});
