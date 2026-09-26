<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Models\Athlete;
use App\Models\AthletePromotion;
use Carbon\CarbonImmutable;

/**
 * How long an athlete has held their belt, and how many sessions since their
 * last stripe (#1772): the two numbers a coach reads before deciding whether
 * someone is due, which the timeline below them only lists as events.
 *
 * **Measured from recorded rows only.** No belt row means null, never the
 * joining date: "eight months at blue" has to mean eight months since a
 * recorded promotion. Since #1771 every new or imported athlete opens with a
 * starting belt row, so the null case is an athlete from before that.
 *
 * **A stripe older than the current belt is not the last stripe.** A belt
 * promotion resets stripes, and the chain validator deliberately does not
 * cross-check the two kinds, so a stripe row can predate the belt row.
 *
 * **Only a stripe given counts.** Promoting blue-four to purple-zero in one
 * save writes a belt row and a 4 → 0 stripe row at the same moment; that
 * reset is not "the last stripe". Rows that do not raise the count are
 * skipped.
 *
 * **The current belt and stripes ride along**, so the reader can tell "no
 * stripe on this belt" from stripes that exist with no dated row (an athlete
 * created on two stripes opens with a belt row only, #1771), and word a dan
 * or a poom as such.
 *
 * **Whole days.** `recorded_at` is a datetime on a date-only surface: a row
 * written live carries a time of day, so the belt given at 18:42 must not
 * exclude that evening's own session.
 *
 * **Sessions are days.** At most one live presence exists per athlete and
 * day, and the SoftDeletes scope drops a corrected-away one.
 */
class GetAthleteProgressionAction
{
    /**
     * @return array{
     *     belt: string,
     *     stripes: int,
     *     belt_since: string|null,
     *     days_at_belt: int|null,
     *     months_at_belt: int|null,
     *     sessions_at_belt: int|null,
     *     stripe_since: string|null,
     *     days_since_stripe: int|null,
     *     sessions_since_stripe: int|null,
     * }
     */
    public function execute(Athlete $athlete): array
    {
        $today = CarbonImmutable::today();

        $beltSince = $this->dayOf($this->latest($athlete, 'belt'));
        $stripeSince = $beltSince === null ? null : $this->dayOf($this->latestStripeGiven($athlete));
        if ($beltSince !== null && $stripeSince?->lt($beltSince)) {
            $stripeSince = null;
        }

        return [
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'belt_since' => $beltSince?->toDateString(),
            'days_at_belt' => $beltSince === null ? null : (int) $beltSince->diffInDays($today),
            'months_at_belt' => $beltSince === null ? null : (int) floor($beltSince->diffInMonths($today)),
            'sessions_at_belt' => $beltSince === null ? null : $this->sessionsSince($athlete, $beltSince),
            'stripe_since' => $stripeSince?->toDateString(),
            'days_since_stripe' => $stripeSince === null ? null : (int) $stripeSince->diffInDays($today),
            'sessions_since_stripe' => $stripeSince === null ? null : $this->sessionsSince($athlete, $stripeSince),
        ];
    }

    private function latest(Athlete $athlete, string $kind): ?AthletePromotion
    {
        // `promotions()` is ordered `recorded_at DESC, id DESC`.
        return $athlete->promotions()->where('kind', $kind)->first();
    }

    private function latestStripeGiven(Athlete $athlete): ?AthletePromotion
    {
        return $athlete->promotions()
            ->where('kind', 'stripe')
            ->whereColumn('to_stripes', '>', 'from_stripes')
            ->first();
    }

    private function dayOf(?AthletePromotion $row): ?CarbonImmutable
    {
        return $row?->recorded_at->toImmutable()->startOfDay();
    }

    private function sessionsSince(Athlete $athlete, CarbonImmutable $since): int
    {
        return $athlete->attendanceRecords()
            ->whereDate('attended_on', '>=', $since->toDateString())
            ->count();
    }
}
