<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Who claimed the attendance row. Defaults to `Instructor` for
 * legacy rows and for the owner-side "mark presence" widget. `Self`
 * is set by the athlete-side `POST /me/attendance/today` endpoint —
 * lets the instructor distinguish self-reported presence from rows
 * they entered themselves.
 */
enum AttendanceSource: string
{
    case Instructor = 'instructor';
    case Self = 'self';
}
