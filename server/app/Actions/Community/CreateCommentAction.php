<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;

/**
 * Insert a 1-level comment under a community post (#604, M9 PR-D
 * server). Eager-loads the relations the resource needs so the
 * controller can return the post-create payload without a follow-up
 * fetch.
 *
 * Authorization (caller in same academy) + 500-char body validation
 * live in the FormRequest; this Action assumes both pre-conditions
 * are met.
 */
class CreateCommentAction
{
    public function execute(CommunityPost $post, User $author, string $body): PostComment
    {
        $comment = PostComment::create([
            'post_id' => $post->id,
            'user_id' => $author->id,
            'body' => $body,
        ]);

        $comment->load([
            'user:id,first_name,last_name,handle,avatar_path,updated_at',
            'user.athlete:id,user_id,belt',
        ]);

        return $comment;
    }
}
