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
 * entries again. An entry the other device's own rebase found already true
 * or set aside changed nothing there, and is no news here.
 *
 * **It keeps the facts** (`Homecoming`): the rows the entries created, and
 * how many created none of the rows the card counts (an edit, a deletion, a
 * note). The card counts what is still there when it asks
 * (`ShowHomecomingAction`). Two pulls before the owner looks add up.
 *
 * Nothing is told after a stage that wrote no `since`: a restore, or a
 * whole academy arriving (a first pull, the owner's choice when asked).
 *
 * @phpstan-import-type Arrived from Homecoming
 */
final class RecordHomecomingAction
{
    public function execute(?string $device): void
    {
        $since = HomecomingSince::read();
        if ($since === null) {
            return;
        }
        $arrived = self::facts($this->entriesSince($since, $device));
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
    private static function facts(array $entries): ?array
    {
        if ($entries === []) {
            return null;
        }
        $created = array_fill_keys(ShowHomecomingAction::COUNTED, []);
        $other = 0;
        foreach ($entries as $entry) {
            $rows = json_decode((string) $entry->created, true);
            $counted = false;
            foreach (ShowHomecomingAction::COUNTED as $table) {
                $ids = \is_array($rows) && \is_array($rows[$table] ?? null) ? $rows[$table] : [];
                if ($ids !== []) {
                    $created[$table] = array_values([...$created[$table], ...array_map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0, $ids)]);
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
            'created' => $created,
            'other' => $other,
        ];
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
        $created = [];
        foreach (ShowHomecomingAction::COUNTED as $table) {
            $created[$table] = array_values(array_unique([...($kept['created'][$table] ?? []), ...($arrived['created'][$table] ?? [])]));
        }

        return [...$arrived, 'created' => $created, 'other' => $kept['other'] + $arrived['other']];
    }
}
