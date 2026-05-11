<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;
use App\Models\PostComment;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Paginated list of comments on a community post (#604, M9 PR-D
 * server).
 *
 * Eager-loads the `user` relation (with the linked athlete row for
 * the belt) so the resource can render the identity flair line
 * (name · @handle · belt) without N+1. Soft-deleted comments are
 * excluded by Eloquent's default scope (the schema's compound index
 * `(post_id, deleted_at, created_at)` keeps this cheap).
 *
 * Comments are returned in ascending-created-at order — the natural
 * read order for a thread (top-to-bottom). 50/page is generous for a
 * 1-level (PRD hard rule) comment thread.
 *
 * Authorization (caller belongs to the post's academy) is the
 * FormRequest's job; this Action assumes the caller is allowed.
 */
class ListCommentsAction
{
    /**
     * @return LengthAwarePaginator<int, PostComment>
     */
    public function execute(CommunityPost $post, int $perPage = 50): LengthAwarePaginator
    {
        return PostComment::query()
            ->where('post_id', $post->id)
            ->with([
                'user:id,first_name,last_name,handle,avatar_path,updated_at',
                'user.athlete:id,user_id,belt',
            ])
            ->orderBy('created_at')
            ->paginate($perPage);
    }
}
