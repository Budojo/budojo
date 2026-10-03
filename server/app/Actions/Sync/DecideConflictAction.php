<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Support\Facades\DB;

/**
 * The owner's answer to a set-aside write (#2031, PRD § 6.4):
 * - `theirs`: what is here stays;
 * - `mine`: the page sent the conflict's `retry` first, so the write is
 *   true here now;
 * - `by-hand`: the owner set it right themselves.
 *
 * It only records the answer, and **it is journaled** (`sync.conflicts.`):
 * the answer then reaches the other device's database even when a rebase
 * there starts from a version that still asks. A conflict this database does
 * not hold, or one decided already, is left as it is: replayed on another
 * database, the same answer is never a question of its own.
 */
final class DecideConflictAction
{
    public const array DECISIONS = ['theirs', 'mine', 'by-hand'];

    public function execute(string $entryId, string $decision): void
    {
        DB::table('sync_conflicts')
            ->where('entry_id', $entryId)
            ->whereNull('decided_at')
            ->update(['decided_at' => now(), 'decision' => $decision]);
    }
}
