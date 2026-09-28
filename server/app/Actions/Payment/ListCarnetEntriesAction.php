<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Carnet;
use App\Models\CarnetEntry;
use Illuminate\Database\Eloquent\Collection;

class ListCarnetEntriesAction
{
    /**
     * The "where did my ten entries go" register: every session this carnet
     * paid for, most recent first, with the lesson each one was for (#1654) —
     * a bare date answers "when", and the owner is usually asking "for what".
     *
     * @return Collection<int, CarnetEntry>
     */
    public function execute(Carnet $carnet): Collection
    {
        return $carnet->entries()
            ->with('attendanceRecord.lesson')
            ->orderByDesc('used_on')
            ->orderByDesc('id')
            ->get();
    }
}
