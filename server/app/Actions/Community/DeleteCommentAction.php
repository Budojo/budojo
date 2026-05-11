<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\PostComment;

/**
 * Soft-delete a comment (#604, M9 PR-D server). Owner-or-author
 * authorization sits in the FormRequest (the controller stays
 * humble), so this Action assumes the caller is allowed.
 *
 * Soft-delete (not hard) keeps the row + its audit trail recoverable;
 * the listing query filters on `deleted_at IS NULL` so the comment
 * disappears from threads immediately.
 */
class DeleteCommentAction
{
    public function execute(PostComment $comment): void
    {
        $comment->delete();
    }
}
