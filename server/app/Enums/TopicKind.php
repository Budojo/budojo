<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What a syllabus topic is trained in (#1563).
 *
 * Heel hooks live in no-gi, lapel guards in gi, and a coverage chart that
 * mixes the two says a number that is quietly wrong. Three cases and not
 * {@see ClassKind}'s four: a topic is jiu-jitsu by definition, so there is no
 * "other" for it to be.
 */
enum TopicKind: string
{
    case Gi = 'gi';
    case NoGi = 'nogi';
    case Both = 'both';
}
