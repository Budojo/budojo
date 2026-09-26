<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Support\AthleteIdentity;
use App\Support\BillingFloor;
use App\Support\MonthlyFee;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * Who is behind, since when, and by how much (#1760).
 *
 * The unpaid chip chases **this** month; nothing answered "who has been
 * behind since July". This does, for every month from the athlete's billing
 * floor up to **last** month — never the current one, which belongs to the
 * chip and its day-16 digest. Two surfaces counting the current month
 * differently is how a tile and a list come to disagree.
 *
 * Built from the rules that already exist, not beside them:
 *
 * - **who can owe** is the roster's `owing` population — active and expected
 *   to pay — narrowed to a fee above zero, because a month priced at nothing
 *   is not a debt worth a row;
 * - **what pays a month** is `Athlete::scopePaidDuring`: a covering payment
 *   (`AthletePayment::scopeCovering`) or a carnet spendable on some day of it;
 * - **from when** is `BillingFloor`: the later of the academy's `billing_from`
 *   and the athlete's joining month. Without it an athlete who joined in 2019
 *   reads eighty months behind on an install from this spring.
 *
 * **The amount is an estimate**, at the athlete's fee today: nothing records
 * what the fee was in March. The page says so.
 */
final class PaymentsArrearsAction
{
    /**
     * @return list<array{athlete: array<string, mixed>, months_behind: int, first_unpaid: string, owed_cents: int}>
     */
    public function execute(Academy $academy, CarbonInterface $today): array
    {
        $lastMonth = AthletePayment::monthIndex($today->year, $today->month) - 1;
        $floors = $this->floorsOf($this->population($academy), $academy, $lastMonth);
        if ($floors === []) {
            return [];
        }

        $unpaid = $this->unpaidMonths($floors, $lastMonth);

        $rows = [];
        foreach ($floors as ['athlete' => $athlete]) {
            $months = $unpaid[$athlete->id] ?? [];
            $fee = MonthlyFee::forAthlete($athlete);
            if ($months === [] || $fee === null) {
                continue;
            }

            $rows[] = [
                'athlete' => AthleteIdentity::of($athlete),
                'months_behind' => \count($months),
                'first_unpaid' => self::format(min($months)),
                'owed_cents' => \count($months) * $fee,
            ];
        }

        // Stable: within the same count, the population's alphabetical order.
        usort($rows, static fn (array $a, array $b): int => $b['months_behind'] <=> $a['months_behind']);

        return $rows;
    }

    /**
     * Everyone who could be behind: the `owing` population, less a fee of
     * nothing. Alphabetical, so the final sort only has to rank by months.
     *
     * @return Collection<int, Athlete>
     */
    private function population(Academy $academy): Collection
    {
        return $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->expectedToPay()
            ->chargedMoreThanNothing()
            ->with(['feeTier', 'user'])
            ->orderBy('last_name_sort')
            ->orderBy('first_name_sort')
            ->get()
            ->each(fn (Athlete $athlete) => $athlete->setRelation('academy', $academy));
    }

    /**
     * Each athlete's first billable month, for those who have one before the
     * current month.
     *
     * @param  Collection<int, Athlete>  $athletes
     * @return array<int, array{athlete: Athlete, floor: int}>
     */
    private function floorsOf(Collection $athletes, Academy $academy, int $lastMonth): array
    {
        $floors = [];
        foreach ($athletes as $athlete) {
            $floor = BillingFloor::monthIndexFor($academy, $athlete);
            if ($floor !== null && $floor <= $lastMonth) {
                $floors[$athlete->id] = ['athlete' => $athlete, 'floor' => $floor];
            }
        }

        return $floors;
    }

    /**
     * The months nothing paid for, per athlete, each from that athlete's own
     * floor. One query per month over the whole population: a season is a
     * dozen queries, where one per athlete per month would be hundreds.
     *
     * @param  array<int, array{athlete: Athlete, floor: int}>  $floors
     * @return array<int, list<int>>
     */
    private function unpaidMonths(array $floors, int $lastMonth): array
    {
        $unpaid = [];
        $ids = array_keys($floors);
        $from = min($lastMonth, ...array_column($floors, 'floor'));

        for ($index = $from; $index <= $lastMonth; $index++) {
            [$year, $month] = [intdiv($index, 12), $index % 12 + 1];

            /** @var list<int> $owing */
            $owing = Athlete::query()
                ->whereIn('id', $ids)
                ->whereNot(fn ($q) => $q->paidDuring($year, $month))
                ->pluck('id')
                ->all();

            foreach ($owing as $id) {
                if ($floors[$id]['floor'] <= $index) {
                    $unpaid[$id][] = $index;
                }
            }
        }

        return $unpaid;
    }

    private static function format(int $index): string
    {
        return \sprintf('%04d-%02d', intdiv($index, 12), $index % 12 + 1);
    }
}
