<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Illuminate\Support\Facades\DB;

class ReconcileCarnetEntriesAction
{
    /**
     * Rebuilds the carnet ledger of one or more athletes from the facts (#1380).
     *
     * This replaces the event-driven consumption that shipped in #1368, where
     * an entry was charged at the moment a presence was marked and sessions
     * predating the sale were never looked at again. A carnet can now be dated
     * to cover a period that has already happened, so what it pays for is a
     * **function of its window**, not of when someone clicked.
     *
     * The rule, applied to every session the athlete has attended, oldest first:
     *
     *  - a month covered by an `athlete_payments` row charges nothing — the
     *    monthly fee keeps its precedence;
     *  - otherwise the session goes to the first carnet whose window contains
     *    it and which still has room, earliest expiry first, so what is about
     *    to expire is spent before what is not;
     *  - a session no carnet can take is simply uncovered. Attendance is a
     *    register, never a gate.
     *
     * `carnet_entries` is therefore a **projection**, not a log. Every input
     * that can move the result — a presence added or removed, a carnet sold,
     * re-dated or deleted, a monthly payment recorded or undone — runs this
     * afterwards. A wider blast radius than the old model, and the price of the
     * balance being correct rather than merely consistent with the order things
     * happened in.
     *
     * It also removes a discrepancy the old model accepted: marking a month
     * paid now releases the entries that month had consumed. Under event-driven
     * consumption that was deliberate ("evaluated at marking time"); once the
     * balance is a function of its inputs, freezing it would be the anomaly.
     *
     * Takes a list rather than a single athlete because the owner's daily mark
     * is a bulk operation: every lookup below is one query for the whole batch,
     * so twenty athletes cost what one does plus the writes.
     *
     * @param  list<int>  $athleteIds
     */
    public function execute(array $athleteIds): void
    {
        $athleteIds = array_values(array_unique($athleteIds));

        if ($athleteIds === []) {
            return;
        }

        DB::transaction(function () use ($athleteIds): void {
            $carnets = Carnet::query()
                ->whereIn('athlete_id', $athleteIds)
                ->orderBy('expires_at')
                ->orderBy('id')
                ->get()
                ->groupBy('athlete_id');

            $sessions = AttendanceRecord::query()
                ->whereIn('athlete_id', $athleteIds)
                ->orderBy('attended_on')
                ->orderBy('id')
                ->get(['id', 'athlete_id', 'attended_on'])
                ->groupBy('athlete_id');

            $coveredMonths = $this->monthsCoveredByFee($athleteIds);

            $wanted = [];
            foreach ($athleteIds as $athleteId) {
                foreach ($this->assign(
                    $carnets->get($athleteId, collect()),
                    $sessions->get($athleteId, collect()),
                    $coveredMonths[$athleteId] ?? [],
                ) as $attendanceId => $carnetId) {
                    $wanted[$attendanceId] = $carnetId;
                }
            }

            $this->persist($athleteIds, $wanted);
        });
    }

    /**
     * Hands each session to the carnet that should pay for it, or to nothing.
     *
     * Date order matters twice over: it is what "the first ten sessions count"
     * means when a window holds more sessions than a carnet has entries, and it
     * keeps the outcome stable — the same facts always produce the same ledger,
     * which is what lets this be re-run at will.
     *
     * @param  \Illuminate\Support\Collection<int, Carnet>  $carnets  earliest expiry first
     * @param  \Illuminate\Support\Collection<int, AttendanceRecord>  $sessions  oldest first
     * @param  array<string, true>  $coveredMonths
     * @return array<int, int> attendance record id => carnet id
     */
    private function assign($carnets, $sessions, array $coveredMonths): array
    {
        if ($carnets->isEmpty()) {
            return [];
        }

        $remaining = [];
        foreach ($carnets as $carnet) {
            $remaining[$carnet->id] = $carnet->total_entries;
        }

        $assignment = [];

        foreach ($sessions as $session) {
            $day = $session->attended_on;

            if (isset($coveredMonths[$day->format('Y-m')])) {
                continue;
            }

            foreach ($carnets as $carnet) {
                if ($remaining[$carnet->id] < 1) {
                    continue;
                }
                if ($day->lessThan($carnet->valid_from) || $day->greaterThan($carnet->expires_at)) {
                    continue;
                }

                $assignment[$session->id] = $carnet->id;
                $remaining[$carnet->id]--;

                break;
            }
        }

        return $assignment;
    }

    /**
     * `Y-m` keys of the months the monthly fee already paid for, per athlete.
     * One query for the batch: an athlete's payment count is bounded by how
     * long they have been a member, and re-querying per session would turn a
     * reconciliation into an N+1.
     *
     * @param  list<int>  $athleteIds
     * @return array<int, array<string, true>>
     */
    private function monthsCoveredByFee(array $athleteIds): array
    {
        $byAthlete = [];

        $payments = AthletePayment::query()
            ->whereIn('athlete_id', $athleteIds)
            ->get(['athlete_id', 'year', 'month']);

        foreach ($payments as $payment) {
            $byAthlete[$payment->athlete_id][\sprintf('%04d-%02d', $payment->year, $payment->month)] = true;
        }

        return $byAthlete;
    }

    /**
     * Writes only the difference. Dropping the ledger and re-inserting it would
     * be simpler, and would churn every row's id and timestamps on every
     * attendance mark — turning the audit trail into noise and making "when was
     * this entry spent" unanswerable.
     *
     * @param  list<int>  $athleteIds
     * @param  array<int, int>  $wanted attendance record id => carnet id
     */
    private function persist(array $athleteIds, array $wanted): void
    {
        $carnetIds = Carnet::query()->whereIn('athlete_id', $athleteIds)->pluck('id');

        $existing = CarnetEntry::query()
            ->whereIn('carnet_id', $carnetIds)
            ->get()
            ->keyBy('attendance_record_id');

        $staleIds = [];
        foreach ($existing as $attendanceId => $entry) {
            if (($wanted[$attendanceId] ?? null) !== $entry->carnet_id) {
                $staleIds[] = $entry->id;
            }
        }

        if ($staleIds !== []) {
            CarnetEntry::query()->whereIn('id', $staleIds)->delete();
        }

        $toCreate = array_filter(
            $wanted,
            static fn (int $carnetId, int $attendanceId): bool => ! isset($existing[$attendanceId])
                || $existing[$attendanceId]->carnet_id !== $carnetId,
            ARRAY_FILTER_USE_BOTH,
        );

        if ($toCreate === []) {
            return;
        }

        /** @var array<int, string> $usedOn */
        $usedOn = [];
        foreach (AttendanceRecord::query()->whereIn('id', array_keys($toCreate))->get(['id', 'attended_on']) as $record) {
            $usedOn[$record->id] = $record->attended_on->toDateString();
        }

        foreach ($toCreate as $attendanceId => $carnetId) {
            CarnetEntry::create([
                'carnet_id' => $carnetId,
                'attendance_record_id' => $attendanceId,
                'used_on' => $usedOn[$attendanceId],
            ]);
        }
    }
}
