<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use App\Models\Athlete;
use App\Support\AthleteIdentity;
use App\Support\MonthlyFee;
use App\Support\UnpaidMonths;
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
 * The last two are `UnpaidMonths`, which the ledger's «In ritardo» asks too
 * (#1654): a month late here is late there.
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
        $population = $this->population($academy);
        $unpaid = UnpaidMonths::of($population, $academy, $today);

        $rows = [];
        foreach ($population as $athlete) {
            $months = $unpaid[$athlete->id] ?? [];
            $fee = MonthlyFee::forAthlete($athlete);
            if ($months === [] || $fee === null) {
                continue;
            }

            $rows[] = [
                'athlete' => AthleteIdentity::of($athlete),
                'months_behind' => \count($months),
                'first_unpaid' => UnpaidMonths::format(min($months)),
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
            ->canFallBehind()
            ->with(['feeTier', 'user'])
            ->orderBy('last_name_sort')
            ->orderBy('first_name_sort')
            ->get()
            ->each(fn (Athlete $athlete) => $athlete->setRelation('academy', $academy));
    }
}
