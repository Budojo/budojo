<?php

declare(strict_types=1);

namespace App\Support\Promotion;

use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;

/**
 * Whether a starting row is still the placeholder written the day its athlete
 * was entered (#1771), or a start the owner has dated (#1990).
 *
 * Every timeline opens with a starting row dated the day of entry: it says the
 * belt, not when it was reached nor the stripes already on it. Moved off that
 * day with the pencil, it is the owner saying "he started here, then": the
 * athlete arrived on that belt that day with no stripes, and the ones after it
 * are missing like any others.
 *
 * One rule for the two readers that need it — the gap finder, which holds the
 * stripes of a placeholder as history before the record, and the "È la data
 * d'inserimento" note on the timeline, which only a placeholder deserves.
 *
 * The day of entry is read both ways a starting row was ever dated: the UTC
 * day of `created_at`, as rows written with `now()` before #1963 carry it, and
 * the owner's day, as rows written since do.
 */
final class EntryPlaceholder
{
    public static function is(AthletePromotion $promotion, Athlete $athlete): bool
    {
        $day = CarbonImmutable::make($promotion->recorded_at)?->toDateString();

        return $promotion->kind === 'belt'
            && $promotion->from_belt === null
            && $day !== null
            && \in_array($day, self::days($athlete), true);
    }

    /**
     * @return list<string> the days the athlete was entered on, as `Y-m-d`
     */
    private static function days(Athlete $athlete): array
    {
        $created = CarbonImmutable::make($athlete->created_at);
        if ($created === null) {
            return [];
        }

        return array_values(array_unique([
            $created->utc()->toDateString(),
            $created->setTimezone(OperatorDay::timezone())->toDateString(),
        ]));
    }
}
