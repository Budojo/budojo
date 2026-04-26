<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;
use Illuminate\Database\Eloquent\Collection;

class ListAthletePaymentsAction
{
    /**
     * Returns the athlete's payments for the given year, ordered by month
     * ascending (January → December — calendar order, easiest to scan and
     * to render as a 12-cell grid client-side without a sort step).
     *
     * @return Collection<int, AthletePayment>
     */
    public function execute(Athlete $athlete, int $year): Collection
    {
        return AthletePayment::query()
            ->where('athlete_id', $athlete->id)
            ->where('year', $year)
            ->orderBy('month', 'asc')
            ->get();
    }
}
