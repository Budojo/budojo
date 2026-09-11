<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What a class is trained in (#1562).
 *
 * A dimension of the class, not a tag on a lesson: heel hooks live in no-gi,
 * lapel guards live in gi, and a coverage chart that mixes the two says a
 * number that is quietly wrong. Copied onto each lesson the class produces,
 * so the past keeps the kind it was actually trained in.
 *
 * `Other` is for what is on the timetable without being jiu-jitsu in a kimono
 * or out of one — conditioning, wrestling, a yoga slot.
 */
enum ClassKind: string
{
    case Gi = 'gi';
    case NoGi = 'nogi';
    case Both = 'both';
    case Other = 'other';
}
