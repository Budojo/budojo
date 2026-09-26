<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Athlete;
use Illuminate\Support\Facades\Cache;

/**
 * The athlete attendance summary's cache (#1769): five minutes per athlete
 * and window, and a version per academy that anything in the summary bumps
 * (`ForgetsAttendanceSummaries`).
 *
 * The summary divides by the academy's scheduled days, closures out, so a
 * closure saved or a timetable changed moves every athlete's number at once;
 * a presence marked moves a numerator, and a corrected joining date moves
 * where a window starts.
 * Keys cannot be listed (the months are open-ended), so each key carries the
 * academy's version and a bump orphans them all; they expire on their own.
 */
final class AttendanceSummaryCache
{
    public const int TTL_SECONDS = 300;

    public static function key(Athlete $athlete, string $window): string
    {
        return \sprintf(
            'attendance.summary.athlete.%d.%s.v%d',
            $athlete->id,
            $window,
            self::version($athlete->academy_id),
        );
    }

    /** Every cached summary of this academy's athletes stops being read. */
    public static function forgetAcademy(int $academyId): void
    {
        Cache::forever(self::versionKey($academyId), self::version($academyId) + 1);
    }

    private static function version(int $academyId): int
    {
        $version = Cache::get(self::versionKey($academyId), 0);

        return \is_int($version) ? $version : 0;
    }

    private static function versionKey(int $academyId): string
    {
        return "attendance.summary.version.{$academyId}";
    }
}
