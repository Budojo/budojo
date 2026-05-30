<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Builds the English title for an aggregated inbox notification (#1139):
 *
 *  - alone        → "{actor} {phrase}"
 *  - one other    → "{actor} and 1 other {phrase}"
 *  - many others  → "{actor} and {n} others {phrase}"
 *
 * The verb inside `$phrase` is past tense ("reacted to your post"), so it
 * reads correctly whether the subject is one person or several. Notification
 * titles are English-stored at write time across the whole subsystem, so
 * there is no per-viewer localization to thread through here.
 */
final class AggregatedTitle
{
    public static function make(string $actorName, int $otherCount, string $phrase): string
    {
        if ($otherCount <= 0) {
            return "{$actorName} {$phrase}";
        }

        $others = $otherCount === 1 ? '1 other' : "{$otherCount} others";

        return "{$actorName} and {$others} {$phrase}";
    }
}
