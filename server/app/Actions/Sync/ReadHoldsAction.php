<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Support\Facades\DB;

/**
 * `holds` for `devices/<id>.bjs` (#2031): for each device, the newest of its
 * entries this database has dealt with. Ids only grow per device, so holding
 * the newest means holding every one before it.
 */
final class ReadHoldsAction
{
    /** @return array<string, string> */
    public function execute(): array
    {
        $holds = [];
        foreach (DB::table('sync_entries')->selectRaw('device, max(id) as newest')->groupBy('device')->orderBy('device')->get() as $row) {
            $holds[(string) $row->device] = (string) $row->newest;
        }

        return $holds;
    }
}
