<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\ReactionEmoji;
use App\Models\CommunityPost;
use App\Models\PostReaction;
use App\Models\User;

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
        /** @var PostReaction|null $existing */
        $existing = PostReaction::query()
            ->where('post_id', $post->id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing === null) {
            PostReaction::create([
                'post_id' => $post->id,
                'user_id' => $user->id,
                'emoji' => $emoji,
            ]);
            $your = $emoji->value;
        } elseif ($existing->emoji === $emoji) {
            $existing->delete();
            $your = null;
        } else {
            $existing->update(['emoji' => $emoji]);
            $your = $emoji->value;
        }

        return [
            'your_reaction' => $your,
            'counts' => $this->countsFor($post->id),
        ];
    }

    /**
     * @return array{clap: int, pray: int}
     */
    private function countsFor(int $postId): array
    {
        $clap = PostReaction::query()
            ->where('post_id', $postId)
            ->where('emoji', ReactionEmoji::Clap)
            ->count();

        $pray = PostReaction::query()
            ->where('post_id', $postId)
            ->where('emoji', ReactionEmoji::Pray)
            ->count();

        return ['clap' => $clap, 'pray' => $pray];
    }
}
