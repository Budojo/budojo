<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * RSVP response on an event-type community post (#600, M9). Two
 * explicit positive values; the absence of a row means "no answer".
 * No `Declined` value on purpose — letting users mark "going" or
 * "maybe" is more useful than tracking explicit declines (V1 doesn't
 * need to know who decided not to come, only who is coming).
 */
enum RsvpResponse: string
{
    case Going = 'going';
    case Maybe = 'maybe';
}
