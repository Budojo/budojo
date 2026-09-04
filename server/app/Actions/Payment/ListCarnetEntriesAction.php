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
     * paid for, most recent first.
     *
     * @return Collection<int, CarnetEntry>
     */
    public function execute(Carnet $carnet): Collection
    {
        return $carnet->entries()
            ->orderByDesc('used_on')
            ->orderByDesc('id')
            ->get();
    }
}
