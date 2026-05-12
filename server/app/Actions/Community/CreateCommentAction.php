<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;
use App\Notifications\CommunityReplyNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

/**
 * Insert a 1-level comment under a community post (#604, M9 PR-D
 * server). Eager-loads the relations the resource needs so the
 * controller can return the post-create payload without a follow-up
 * fetch.
 *
 * Authorization (caller in same academy) + 500-char body validation
 * live in the FormRequest; this Action assumes both pre-conditions
 * are met.
 *
 * **Fanout (M9 PR-F slice 1, #606)**: after inserting, the Action
 * notifies every prior sibling commenter under the same post who
 * has the `community_reply` category enabled, excluding the new
 * comment's author. The fanout is best-effort — failures are
 * isolated per recipient and DO NOT roll back the comment write.
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

        $this->notifySiblingCommenters($post, $comment, $author);

        return $comment;
    }

    /**
     * Find every distinct user who previously commented under this
     * post, drop the new comment's author, drop anyone who opted out
     * of `community_reply`, send each remaining user the inbox
     * notification.
     */
    private function notifySiblingCommenters(
        CommunityPost $post,
        PostComment $newComment,
        User $author,
    ): void {
        /** @var array<int, int> $recipientIds */
        $recipientIds = PostComment::query()
            ->where('post_id', $post->id)
            ->where('id', '!=', $newComment->id)
            ->where('user_id', '!=', $author->id)
            ->distinct()
            ->pluck('user_id')
            ->all();

        if ($recipientIds === []) {
            return;
        }

        /** @var \Illuminate\Database\Eloquent\Collection<int, User> $recipients */
        $recipients = User::query()->whereIn('id', $recipientIds)->get();

        $eligible = $recipients->filter(
            fn (User $u) => NotificationPreferences::isEnabled($u, NotificationCategory::COMMUNITY_REPLY),
        );

        if ($eligible->isEmpty()) {
            return;
        }

        // Best-effort fanout: if the inbox INSERT throws (DB hiccup,
        // deadlock, exotic driver error) the comment write has
        // already committed; the controller's 201 path should
        // remain. Logging preserves the audit trail without
        // surfacing a 500 to the caller — the docblock above
        // promises this shape; previously the unwrapped
        // `Notification::send` could 500 after a successful insert
        // (Copilot review on PR #629).
        try {
            Notification::send($eligible, new CommunityReplyNotification($newComment, $author));
        } catch (\Throwable $e) {
            Log::warning('community_reply notification fanout failed', [
                'post_id' => $newComment->post_id,
                'comment_id' => $newComment->id,
                'recipient_count' => $eligible->count(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
