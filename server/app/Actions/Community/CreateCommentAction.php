<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;
use App\Notifications\CommunityCommentOnYourPostNotification;
use App\Notifications\CommunityReplyNotification;
use App\Support\InboxAggregator;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Log;

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
 * comment's author. Each recipient is routed through the
 * {@see InboxAggregator} (#1139) so a burst of comments folds into a
 * single "X and N others …" inbox row per recipient instead of
 * stacking a fresh row + push each time. The whole fanout is
 * best-effort — wrapped in one try/catch on the Action's side: a DB
 * hiccup is logged and swallowed (the comment row has already
 * committed) and surfaces as a single warning entry, not one per
 * recipient. Acceptable for V1: the inbox row is best-effort UX, not
 * a delivery guarantee.
 */
class CreateCommentAction
{
    public function __construct(private readonly InboxAggregator $aggregator)
    {
    }

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
        $this->notifyPostAuthor($post, $comment, $author);

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

        // Best-effort fanout: if a fold/insert throws (DB hiccup,
        // deadlock, exotic driver error) the comment write has already
        // committed; the controller's 201 path must remain. One
        // try/catch around the whole loop logs once and swallows — the
        // docblock above promises this shape (an unwrapped fanout could
        // 500 after a successful insert; Copilot review on PR #629).
        try {
            foreach ($eligible as $recipient) {
                $this->aggregator->record($recipient, new CommunityReplyNotification($newComment, $author));
            }
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

    /**
     * Ping the post author (#729 A6). Distinct from the sibling-
     * commenter fanout above — those notify everyone in a thread you
     * participate in; this notifies the author when their post
     * receives a new comment. The commenter is excluded (no self-
     * ping). Best-effort, same shape as the sibling fanout.
     */
    private function notifyPostAuthor(
        CommunityPost $post,
        PostComment $newComment,
        User $author,
    ): void {
        $postAuthor = $post->createdBy;
        if ($postAuthor->id === $author->id) {
            return;
        }
        if (! NotificationPreferences::isEnabled($postAuthor, NotificationCategory::COMMUNITY_COMMENT_ON_YOUR_POST)) {
            return;
        }

        try {
            $this->aggregator->record($postAuthor, new CommunityCommentOnYourPostNotification($newComment, $author));
        } catch (\Throwable $e) {
            Log::warning('community_comment_on_your_post notification failed', [
                'post_id' => $newComment->post_id,
                'comment_id' => $newComment->id,
                'post_author_id' => $postAuthor->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
