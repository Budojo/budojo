<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use App\Support\CarnetAvailability;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class ConsumeCarnetEntriesAction
{
    /**
     * Charges one carnet entry for each presence not already covered by the
     * monthly fee.
     *
     * **Monthly-first, carnet frozen** (#1364): an athlete whose `(year,
     * month)` for the attended date is paid consumes nothing — the carnet is a
     * fallback, never a parallel charge. An athlete with neither is recorded
     * present and charged nothing: attendance is a register, not a turnstile.
     *
     * Everything is judged against `$date`, the date being attended, not
     * today. Back-filling last month's sessions is routine, and a session must
     * be charged against the coverage that was in force when it happened.
     *
     * Callers pass **freshly created** records only. Re-marking someone who is
     * already present must not charge a second entry; the unique index on
     * `carnet_entries.attendance_record_id` is the backstop if that ever
     * breaks.
     *
     * @param  Collection<int, AttendanceRecord>  $newRecords
     */
    public function execute(Collection $newRecords, CarbonInterface $date): void
    {
        if ($newRecords->isEmpty()) {
            return;
        }

        /** @var list<int> $athleteIds */
        $athleteIds = $newRecords->pluck('athlete_id')->unique()->values()->all();

        $coveredByMonthly = $this->athletesWithMonthlyCoverage($athleteIds, $date);

        /** @var list<int> $uncovered */
        $uncovered = array_values(array_filter(
            $athleteIds,
            static fn (int $id): bool => ! isset($coveredByMonthly[$id]),
        ));

        if ($uncovered === []) {
            return;
        }

        $carnetsByAthlete = $this->spendableCarnets($uncovered, $date);

        foreach ($newRecords as $record) {
            if (isset($coveredByMonthly[$record->athlete_id])) {
                continue;
            }

            // The candidates are already ordered earliest-expiry-first, so the
            // first spendable one is the FIFO pick.
            $carnet = array_find(
                $carnetsByAthlete[$record->athlete_id] ?? [],
                static fn (Carnet $c): bool => CarnetAvailability::isActiveOn($c, $date),
            );

            if ($carnet === null) {
                continue;
            }

            CarnetEntry::create([
                'carnet_id' => $carnet->id,
                'attendance_record_id' => $record->id,
                'used_on' => $record->attended_on->toDateString(),
            ]);

            // The candidates were counted once before the loop, so without
            // this the balance test would read a stale snapshot for every
            // iteration after the first. Today's only caller marks one date
            // and cannot hand two records for the same athlete, but relying on
            // that would make this action correct by luck rather than by rule.
            $carnet->setAttribute('entries_count', ($carnet->entries_count ?? 0) + 1);
        }
    }

    /**
     * One query for the whole batch — a per-athlete lookup inside the loop
     * would be an N+1 on the owner's daily bulk mark.
     *
     * @param  list<int>  $athleteIds
     * @return array<int, true> athlete ids as keys, for O(1) membership tests
     */
    private function athletesWithMonthlyCoverage(array $athleteIds, CarbonInterface $date): array
    {
        /** @var list<int> $ids */
        $ids = AthletePayment::query()
            ->whereIn('athlete_id', $athleteIds)
            ->where('year', $date->year)
            ->where('month', $date->month)
            ->pluck('athlete_id')
            ->all();

        return array_fill_keys($ids, true);
    }

    /**
     * Candidate carnets for the batch, pre-filtered and ordered by
     * `Carnet::scopeValidOn` so the **first** spendable match is the one to
     * burn (earliest expiry). The balance half of the rule stays in
     * `CarnetAvailability`.
     *
     * @param  list<int>  $athleteIds
     * @return array<int, list<Carnet>>
     */
    private function spendableCarnets(array $athleteIds, CarbonInterface $date): array
    {
        $candidates = Carnet::query()
            ->whereIn('athlete_id', $athleteIds)
            ->validOn($date)
            ->get();

        $byAthlete = [];
        foreach ($candidates as $carnet) {
            $byAthlete[$carnet->athlete_id][] = $carnet;
        }

        return $byAthlete;
    }
}
