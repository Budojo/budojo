<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;

/**
 * Soft-delete a community post (#612, M9 PR-B server). Owner-only —
 * the authorization check sits in the FormRequest (the controller is
 * humble per the Clean Architecture rule), so this Action assumes the
 * caller is allowed.
 *
 * Soft-delete (not hard) preserves the row + its reactions / comments
 * / RSVPs (those cascade only on hard delete). The PR-B feed query
 * filters on `deleted_at IS NULL` so a soft-deleted post disappears
 * from the timeline immediately, but the data is recoverable if the
 * owner later changes their mind.
 *
 * V2 may add a 30-day grace window + an "undo" surface; V1 keeps it
 * one-click + irrevocable from the SPA perspective (DB row is still
 * recoverable manually).
 */
class DeleteCommunityPostAction
{
    public function execute(CommunityPost $post): void
    {
        $post->delete();
    }
}
