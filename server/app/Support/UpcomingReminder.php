<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * One reminder the phone hands to Android ahead of time (#2047): when it is
 * due and what it says, in the owner's language. `key` names the occurrence
 * (`unpaid:2026-05`), so the phone keeps one notification per key across its
 * refreshes.
 */
final readonly class UpcomingReminder
{
    public function __construct(
        public string $key,
        public CarbonImmutable $at,
        public string $title,
        public string $body,
        public string $link,
    ) {
    }
}
