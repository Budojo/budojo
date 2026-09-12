<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Mat hours, from the sessions actually attended (#1591).
 *
 * The number used to be `sessions × 1.5`, a flat M4 PRD assumption that every
 * class runs ninety minutes. It was never wired to the timetable, so an
 * academy whose classes are an hour long read 4.5h for three sessions and
 * would have kept doing so for every future session too — the figure could not
 * be moved by any input the owner had.
 *
 * Now each presence contributes the length of the lesson it names, and the
 * constant survives only as the answer for a presence that names no lesson or
 * a lesson whose class never set a duration.
 *
 * **Hours and sessions stop being proportional, on purpose.** A session is a
 * distinct day — two classes on one evening is one session, deliberately, so
 * that somebody marked twice on a date cannot outrank somebody who trained a
 * different day. But they did train twice as long, and hours should say so.
 * `3× · 4h` is not a contradiction; it is an athlete who doubled up once.
 */
final class MatHours
{
    /**
     * The old flat assumption, kept as the fallback and nothing else.
     *
     * Used for a presence with no lesson — recorded before the timetable, on a
     * day with no class, or by the athlete's self-mark — and for a lesson
     * whose class never set a duration. Storing ninety on those rows instead
     * would turn a guess into something that later reads as a measurement.
     */
    public const int FALLBACK_MINUTES = 90;

    /** Minutes to hours, rounded to the one decimal the UI prints. */
    public static function fromMinutes(int $minutes): float
    {
        return round($minutes / 60, 1);
    }
}
