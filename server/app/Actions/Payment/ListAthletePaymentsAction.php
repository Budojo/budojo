<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;
use Illuminate\Database\Eloquent\Collection;

class ListAthletePaymentsAction
{
    /**
     * Every payment whose period touches the given year, in calendar order.
     *
     * "Touches", not "starts in" (#1382): a quarterly bought in December 2025
     * pays for January and February 2026, and the twelve-month table for 2026
     * cannot render those months as covered without the row behind them. The
     * client reads `year`, `month` and `period_months` off each payment and
     * spreads it across the cells it covers.
     *
     * @return Collection<int, AthletePayment>
     */
    public function execute(Athlete $athlete, int $year): Collection
    {
        return AthletePayment::query()
            ->where('athlete_id', $athlete->id)
            // A period overlaps the year exactly when it overlaps the
            // twelve-month interval starting at January — the same test the
            // overlap guard uses, from the other end.
            ->overlapping($year, 1, 12)
            ->orderBy('year', 'asc')
            ->orderBy('month', 'asc')
            ->get();
    }
}
