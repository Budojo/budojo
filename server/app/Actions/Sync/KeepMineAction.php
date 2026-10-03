<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Models\User;
use App\Support\Http\SubRequest;
use Illuminate\Support\Facades\DB;

/**
 * «Tieni la mia» (#2038, PRD § 6.4): the set-aside write made true here, and
 * the answer recorded, **all or nothing**. A month paid otherwise is undone,
 * then paid again: were the payment refused after the undo, the other
 * device's payment would be gone with nothing in its place. So every request
 * of the conflict's `retry`, and the answer, run in one transaction, through
 * the API as the owner: journaled like any write of theirs, and rolled back
 * whole when one does not go through.
 */
final class KeepMineAction
{
    public function __construct(private readonly ListConflictsAction $conflicts)
    {
    }

    /** @throws ConflictNotKept when nothing would make it true, or a request does not go through */
    public function execute(string $entryId, User $owner): void
    {
        $retry = $this->conflicts->retryOf($entryId, $owner);
        if ($retry === null) {
            throw new ConflictNotKept('Nothing would make that write true here.');
        }

        DB::transaction(function () use ($retry, $entryId, $owner): void {
            foreach ([...$retry, ['method' => 'POST', 'url' => "/api/v1/sync/conflicts/{$entryId}/decision", 'body' => ['decision' => 'mine']]] as $request) {
                [$status, $answer] = SubRequest::send($owner, $request['method'], $request['url'], $request['body']);
                // Refused trimmed (#2113): sent again whole, with this
                // database's values for what it left out.
                $refill = ReplayJournalAction::refill($status, $request['fill'] ?? []);
                if ($refill !== [] && \is_array($request['body'])) {
                    [$status, $answer] = SubRequest::send($owner, $request['method'], $request['url'], [...$request['body'], ...$refill]);
                }
                if ($status < 200 || $status >= 300) {
                    $message = \is_array($answer) && \is_string($answer['message'] ?? null) ? $answer['message'] : "The request answered {$status}.";

                    throw new ConflictNotKept($message);
                }
            }
        });
    }
}
