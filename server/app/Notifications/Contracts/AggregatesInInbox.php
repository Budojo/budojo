<?php

declare(strict_types=1);

namespace App\Notifications\Contracts;

use App\Models\User;

/**
 * A community interaction notification whose inbox row collapses with
 * sibling events on the same post into a single "X and N others …" row
 * (#1139, epic #1128). The {@see \App\Support\InboxAggregator} reads these
 * to fold a new event into the recipient's existing unread row, or create
 * a fresh one.
 */
interface AggregatesInInbox
{
    /** The post the events cluster around — the within-type discriminator. */
    public function inboxPostId(): int;

    /** The actor that triggered THIS event (named when most recent; id dedupes the count). */
    public function inboxActor(): User;

    /**
     * Title for the merged row. `$otherCount` excludes the most-recent
     * actor (0 → the single-actor title).
     */
    public function inboxAggregatedTitle(string $recentActorName, int $otherCount): string;

    /** Body for the merged row — the latest event's body. */
    public function inboxBody(): string;
}
