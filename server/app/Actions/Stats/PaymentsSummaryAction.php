<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Support\BillingFloor;
use App\Support\CollectedByMonth;
use App\Support\MonthlyFee;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * One month's money in four numbers: what should have come in, what did, who
 * is still out and for how much (#1758) — the figures the revenue chart
 * implies and never states.
 *
 * Every definition below has a plausible wrong twin, which is why each one is
 * composed from a rule that already exists rather than written again:
 *
 * - **Population** — active, not the owner training in their own academy, and
 *   charged a fee above zero: `Athlete::scopeExpectedToPay` (the roster's
 *   chip is not a dash) and `scopeChargedMoreThanNothing` (the fee resolves
 *   above zero, #1757). An athlete who trains free is on neither side of the
 *   rate; a trashed athlete is out through the model's soft delete. And only
 *   from their `BillingFloor` on (#1742): nobody owes a month before they
 *   joined, or before the academy kept its fees in Budojo.
 * - **`expected_cents`** — Σ `MonthlyFee::forAthlete()` over the population:
 *   **one month's worth per athlete**, whatever their billing period. An
 *   annual payer adds a twelfth of what they handed over, because this is a
 *   month against a month, and a year paid in September must not make
 *   September's expected twelve times the truth.
 * - **`collected_cents`** — exactly the bar the chart draws for the month,
 *   from `CollectedByMonth`: a fee spread over its period, a carnet whole in
 *   its sale month. Everything the academy took, including from athletes
 *   outside the population — the tile says what came in, not what was owed.
 * - **`outstanding_count` / `outstanding_cents`** — the population with
 *   nothing paying for the month, and Σ their monthly fee. For the current
 *   month (and later) that is `Athlete::scopeOwing` — no covering fee, no
 *   carnet spendable today (#1722), the roster's `?paid=no`. For a month
 *   already over it is `Athlete::scopePaidDuring` — a carnet spendable on
 *   some day of it, with the balance that month began with (#1760) — the same
 *   rule and the same split as the arrears list, so a past month's
 *   outstanding is exactly the athletes the list says were behind in it.
 * - **`collection_rate`** — `collected / expected`, money not heads (two
 *   athletes at €55 and €120 are not half the problem each), and null when
 *   nothing is expected rather than a division by zero.
 * - **`estimated`** — true for any month but the current one. What paid for
 *   a past month is history (payments, carnets and their balance then), but
 *   who was expected to pay, and how much, is not: there is no status or tier
 *   history on `athletes`, so a past month is read against today's roster at
 *   today's fees — someone who left in August is missing from August, and a
 *   fee raised in September reprices it. The arrears list prices its months
 *   the same way. The flag is in the payload because the screen has to say
 *   it out loud.
 */
class PaymentsSummaryAction
{
    public function __construct(
        private readonly CollectedByMonth $collected,
    ) {
    }

    /**
     * @return array{year: int, month: int, currency: string, expected_cents: int, collected_cents: int, outstanding_count: int, outstanding_cents: int, collection_rate: float|null, estimated: bool}
     */
    public function execute(Academy $academy, int $year, int $month): array
    {
        $today = CarbonImmutable::today();
        $bucket = AthletePayment::monthIndex($year, $month);
        $current = AthletePayment::monthIndex($today->year, $today->month);

        $population = $this->population($academy, $bucket);
        $owingIds = $this->owingIds($academy, $year, $month, $bucket < $current);
        $owing = $population->filter(static fn (Athlete $athlete): bool => \in_array($athlete->id, $owingIds, true));
        $expected = $this->feesOf($population);
        $collected = $this->collected->from($academy, $bucket, $bucket)[$bucket];

        return [
            'year' => $year,
            'month' => $month,
            'currency' => MonthlyPaymentsStatsAction::CURRENCY,
            'expected_cents' => $expected,
            'collected_cents' => $collected,
            'outstanding_count' => $owing->count(),
            'outstanding_cents' => $this->feesOf($owing),
            'collection_rate' => $expected === 0 ? null : round($collected / $expected, 3),
            'estimated' => $bucket !== $current,
        ];
    }

    /**
     * The athletes a fee is owed from in the month: charged, and past their
     * billing floor. The floor is a PHP rule over two dates (#1742), so it is
     * applied to the loaded rows rather than restated in SQL.
     *
     * @return Collection<int, Athlete>
     */
    private function population(Academy $academy, int $bucket): Collection
    {
        return $this->query($academy)
            ->with(['feeTier', 'academy'])
            ->get()
            ->filter(static function (Athlete $athlete) use ($academy, $bucket): bool {
                $floor = BillingFloor::monthIndexFor($academy, $athlete);

                return $floor === null || $floor <= $bucket;
            })
            ->values();
    }

    /**
     * Who nothing paid for. A month already over asks what paid for **some
     * day of it** (`paidDuring`, the arrears list's rule); the current month
     * asks what pays **today** (`owing`, the roster's chip). The same split
     * `PaymentsArrearsAction` makes, which is what keeps the two agreeing.
     *
     * @return list<int>
     */
    private function owingIds(Academy $academy, int $year, int $month, bool $isPast): array
    {
        $query = $isPast
            ? $this->query($academy)->whereNot(fn (Builder $q) => $q->paidDuring($year, $month))
            : $this->query($academy)->owing($year, $month, CarbonImmutable::today());

        /** @var list<int> $ids */
        $ids = $query->pluck('id')->all();

        return $ids;
    }

    /** @return Builder<Athlete> */
    private function query(Academy $academy): Builder
    {
        return Athlete::query()
            ->where('academy_id', $academy->id)
            ->where('status', AthleteStatus::Active)
            ->expectedToPay()
            ->chargedMoreThanNothing();
    }

    /** @param Collection<int, Athlete> $athletes */
    private function feesOf(Collection $athletes): int
    {
        return (int) $athletes->sum(static fn (Athlete $athlete): int => MonthlyFee::forAthlete($athlete) ?? 0);
    }
}
