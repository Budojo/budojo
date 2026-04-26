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
     * ascending. The ascending order matches the calendar reading direction
     * (Jan → Dec) — Krug, self-evident UI.
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
