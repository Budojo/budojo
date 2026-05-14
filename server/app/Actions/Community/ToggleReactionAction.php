<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\ReactionEmoji;
use App\Models\CommunityPost;
use App\Models\PostReaction;
use App\Models\User;
use App\Notifications\CommunityReactionOnYourPostNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Toggle an emoji reaction on a community post (#603, M9 PR-C server).
 *
 * Semantics — one row per (post, user) enforced by the UNIQUE index
 * laid down in PR-A:
 *
 * - User had **no** reaction → insert (`created`).
 * - User had the **same** emoji → delete (`removed`, toggle-off).
 * - User had a **different** emoji → swap the row in place
 *   (`updated`). This is the "swap" path the PRD calls out: one
 *   user always shows one emoji or none — never two.
 *
 * The read-then-write is wrapped in a DB transaction with a shared
 * lock on the existing-row read so a concurrent double-tap can't
 * race two INSERTs and surface as a 500 (the second INSERT would
 * hit the UNIQUE(post_id, user_id) constraint). A belt-and-suspenders
 * catch on `QueryException` handles drivers that don't honor the
 * shared lock the way MySQL/InnoDB does — Copilot review on PR #616.
 *
 * The Action returns the resulting state ({your_reaction, counts})
 * so the controller can echo it back in a single HTTP roundtrip; the
 * SPA uses it for optimistic-update reconciliation.
 *
 * Authorization is the FormRequest's job (DI rule); this Action
 * assumes the caller can react on the given post.
 *
 * @phpstan-type ReactionResult array{
 *   your_reaction: 'clap'|'pray'|null,
 *   counts: array{clap: int, pray: int}
 * }
 */
class ToggleReactionAction
{
    /**
     * @return ReactionResult
     */
    public function execute(User $user, CommunityPost $post, ReactionEmoji $emoji): array
    {
        $your = DB::transaction(function () use ($user, $post, $emoji): ?string {
            /** @var PostReaction|null $existing */
            $existing = PostReaction::query()
                ->where('post_id', $post->id)
                ->where('user_id', $user->id)
                ->sharedLock()
                ->first();

            if ($existing === null) {
                try {
                    PostReaction::create([
                        'post_id' => $post->id,
                        'user_id' => $user->id,
                        'emoji' => $emoji,
                    ]);
                } catch (QueryException $e) {
                    if (! $this->isUniqueConstraintViolation($e)) {
                        throw $e;
                    }
                    // A concurrent INSERT slipped through. Treat the
                    // other caller's row as our base state — same
                    // emoji is a no-op, different emoji is a swap.
                    /** @var PostReaction $existing */
                    $existing = PostReaction::query()
                        ->where('post_id', $post->id)
                        ->where('user_id', $user->id)
                        ->firstOrFail();
                    if ($existing->emoji !== $emoji) {
                        $existing->update(['emoji' => $emoji]);
                    }
                }

                return $emoji->value;
            }

            if ($existing->emoji === $emoji) {
                $existing->delete();

                return null;
            }

            $existing->update(['emoji' => $emoji]);

            return $emoji->value;
        });

        // Notify the post author when a reaction LANDS (not when it
        // toggles off — `$your === null` means the user removed their
        // own reaction). Author self-pings are skipped (#729 A7).
        if ($your !== null) {
            $this->notifyPostAuthor($post, $user, $emoji);
        }

        return [
            'your_reaction' => $your,
            'counts' => $this->countsFor($post->id),
        ];
    }

    private function notifyPostAuthor(CommunityPost $post, User $reactor, ReactionEmoji $emoji): void
    {
        $author = $post->createdBy;
        if ($author->id === $reactor->id) {
            return;
        }
        if (! NotificationPreferences::isEnabled($author, NotificationCategory::COMMUNITY_REACTION_ON_YOUR_POST)) {
            return;
        }

        try {
            $author->notify(new CommunityReactionOnYourPostNotification($post, $reactor, $emoji));
        } catch (\Throwable $e) {
            Log::warning('community_reaction_on_your_post notification failed', [
                'post_id' => $post->id,
                'reactor_id' => $reactor->id,
                'author_id' => $author->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @return array{clap: int, pray: int}
     */
    private function countsFor(int $postId): array
    {
        // Single grouped query — 1 round-trip total, regardless of how
        // many emoji cases the enum carries. Stays correct if the
        // enum grows (Copilot review on PR #616).
        /** @var array<string, scalar> $rows */
        $rows = PostReaction::query()
            ->where('post_id', $postId)
            ->selectRaw('emoji, COUNT(*) as n')
            ->groupBy('emoji')
            ->pluck('n', 'emoji')
            ->all();

        $clap = $rows[ReactionEmoji::Clap->value] ?? 0;
        $pray = $rows[ReactionEmoji::Pray->value] ?? 0;

        return [
            'clap' => (int) $clap,
            'pray' => (int) $pray,
        ];
    }

    private function isUniqueConstraintViolation(QueryException $e): bool
    {
        // MySQL / MariaDB → SQLSTATE 23000 + driver code 1062;
        // PostgreSQL → 23505; SQLite → 19 + 'UNIQUE constraint failed'
        // in the message. The pair of checks keeps the test cheap and
        // covers prod (MySQL) and CI (SQLite in-memory) backends.
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
