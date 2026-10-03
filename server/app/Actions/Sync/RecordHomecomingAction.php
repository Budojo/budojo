<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Homecoming;
use App\Support\Sync\HomecomingSince;
use Illuminate\Support\Facades\DB;

/**
 * The homecoming («il rientro», PRD § 6.2, #2039): once another device's
 * version is swapped in, what its work brought, for a card on Oggi.
 * *"Dal telefono, martedì: 14 presenze in BJJ Gi, 2 pagamenti (120 €), 1 nuovo atleta."*
 *
 * **It reads the other device's journal,** which the swapped-in database
 * brought along: its entries this device did not hold before (`HomecomingSince`),
 * every one since the last pull, however many versions the folder went
 * through. The reconcile runs it before the journal keeps only this device's
 * entries again.
 *
 * **It counts what is still there:** a presence the phone recorded and then
 * removed is no presence. The rows the entries created are looked up in the
 * database as it is now; an entry that created none of them (an edit, a
 * deletion, a note) is one more change.
 *
 * Nothing is told after a stage that wrote no `since`: a restore, or a
 * whole academy arriving (a first pull, the owner's choice when asked).
 *
 * @phpstan-import-type Arrived from Homecoming
 */
final class RecordHomecomingAction
{
    /** The rows counted by name, by the table the journal names them under. */
    private const array COUNTED = ['attendance_records', 'athlete_payments', 'athletes', 'athlete_promotions'];

    public function execute(?string $device): void
    {
        $since = HomecomingSince::read();
        if ($since === null) {
            return;
        }
        $arrived = $this->summarize($this->entriesSince($since, $device));
        $kept = Homecoming::read();
        // A start that died after keeping it runs this again: told once.
        if ($arrived !== null && ($kept === null || $arrived['through'] > $kept['through'])) {
            Homecoming::keep($kept === null ? $arrived : self::addUp($kept, $arrived));
        }
        HomecomingSince::clear();
    }

    /**
     * The other device's entries this device did not hold, oldest first,
     * less those its rebase found already true or set aside.
     *
     * @param  array<string, string>  $since
     * @return list<\stdClass>
     */
    private function entriesSince(array $since, ?string $device): array
    {
        // What the other device's own replay found already true or set aside
        // changed nothing there: it is no news here.
        $query = DB::table('sync_journal')
            ->leftJoin('sync_entries', 'sync_entries.id', '=', 'sync_journal.id')
            ->where(static fn ($query) => $query->whereNull('sync_entries.outcome')->orWhereNotIn('sync_entries.outcome', ['already', 'conflict']))
            ->select('sync_journal.*')
            ->orderBy('sync_journal.id');
        if ($device !== null && $device !== '') {
            $query->where('sync_journal.device', '!=', $device);
        }

        /** @var list<\stdClass> */
        return $query->get()
            ->filter(static fn (\stdClass $entry): bool => ! isset($since[(string) $entry->device]) || (string) $entry->id > $since[(string) $entry->device])
            ->values()
            ->all();
    }

    /**
     * @param  list<\stdClass>  $entries
     * @return Arrived|null
     */
    private function summarize(array $entries): ?array
    {
        if ($entries === []) {
            return null;
        }
        $ids = array_fill_keys(self::COUNTED, []);
        $other = 0;
        foreach ($entries as $entry) {
            $created = json_decode((string) $entry->created, true);
            $counted = false;
            foreach (self::COUNTED as $table) {
                $rows = \is_array($created) && \is_array($created[$table] ?? null) ? $created[$table] : [];
                if ($rows !== []) {
                    $ids[$table] = [...$ids[$table], ...array_map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0, $rows)];
                    $counted = true;
                }
            }
            $other += $counted ? 0 : 1;
        }
        $newest = $entries[\count($entries) - 1];

        return [
            'device' => (string) $newest->device,
            'at' => (string) $newest->at,
            'through' => (string) $newest->id,
            'attendance' => $this->presences($ids['attendance_records']),
            'payments' => $this->payments($ids['athlete_payments']),
            'athletes' => DB::table('athletes')->whereIn('id', $ids['athletes'])->whereNull('deleted_at')->count(),
            'promotions' => DB::table('athlete_promotions')->whereIn('id', $ids['athlete_promotions'])->count(),
            'other' => $other,
        ];
    }

    /**
     * By the lesson they were recorded into, the busiest first: *14 in BJJ Gi*.
     *
     * @param  array<int, int>  $ids
     * @return list<array{lesson: string|null, count: int}>
     */
    private function presences(array $ids): array
    {
        /** @var list<array{lesson: string|null, count: int}> */
        return DB::table('attendance_records')
            ->leftJoin('lessons', 'lessons.id', '=', 'attendance_records.lesson_id')
            ->whereIn('attendance_records.id', $ids)
            ->whereNull('attendance_records.deleted_at')
            ->groupBy('lessons.name')
            ->selectRaw('lessons.name as lesson, count(*) as count')
            ->orderByDesc('count')
            ->orderBy('lesson')
            ->get()
            ->map(static fn (\stdClass $row): array => ['lesson' => $row->lesson === null ? null : (string) $row->lesson, 'count' => (int) $row->count])
            ->values()
            ->all();
    }

    /**
     * @param  array<int, int>  $ids
     * @return array{count: int, amount_cents: int}
     */
    private function payments(array $ids): array
    {
        $row = DB::table('athlete_payments')->whereIn('id', $ids)
            ->selectRaw('count(*) as count, coalesce(sum(amount_cents), 0) as amount_cents')
            ->first();

        return ['count' => (int) ($row->count ?? 0), 'amount_cents' => (int) ($row->amount_cents ?? 0)];
    }

    /**
     * Two pulls the owner has not seen yet, as one homecoming.
     *
     * @param  Arrived  $kept
     * @param  Arrived  $arrived
     * @return Arrived
     */
    private static function addUp(array $kept, array $arrived): array
    {
        $byLesson = [];
        foreach ([...$kept['attendance'], ...$arrived['attendance']] as $group) {
            $key = $group['lesson'] ?? '';
            $byLesson[$key] = ['lesson' => $group['lesson'], 'count' => ($byLesson[$key]['count'] ?? 0) + $group['count']];
        }
        $attendance = array_values($byLesson);
        usort($attendance, static fn (array $a, array $b): int => [$b['count'], $a['lesson'] ?? ''] <=> [$a['count'], $b['lesson'] ?? '']);

        return [
            'device' => $arrived['device'],
            'at' => $arrived['at'],
            'through' => $arrived['through'],
            'attendance' => $attendance,
            'payments' => [
                'count' => $kept['payments']['count'] + $arrived['payments']['count'],
                'amount_cents' => $kept['payments']['amount_cents'] + $arrived['payments']['amount_cents'],
            ],
            'athletes' => $kept['athletes'] + $arrived['athletes'],
            'promotions' => $kept['promotions'] + $arrived['promotions'],
            'other' => $kept['other'] + $arrived['other'],
        ];
    }
}
