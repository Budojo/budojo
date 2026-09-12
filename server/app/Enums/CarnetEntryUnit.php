<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What one carnet entry pays for (#1576).
 *
 * With a timetable an athlete can be checked into two classes on the same
 * evening, and whether that is one entry or two is a decision each academy
 * makes for itself — "a pack of ten lessons" and "a pack of ten days on the
 * mat" are both sold under the same name. The default is the lesson, which
 * is what every carnet meant before the timetable existed.
 */
enum CarnetEntryUnit: string
{
    case Lesson = 'lesson';
    case Day = 'day';
}
