<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\RsvpResponse;
use App\Models\CommunityPost;
use App\Models\PostRsvp;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Toggle an RSVP on an event-type community post (#605, M9 PR-E
 * server). Mirrors the reaction-toggle semantics from PR-C:
 *
 * - User had **no** RSVP → insert (state becomes `Going` / `Maybe`).
 * - User had the **same** response → delete (toggle-off).
 * - User had a **different** response → swap in place (Going ↔ Maybe).
 *
 * One row per (post, user) per the PR-A UNIQUE index. The read-then-
 * write runs inside a DB transaction with a shared lock on the
 * existing-row read so concurrent double-tap requests serialize
 * without surfacing a 500 from the UNIQUE constraint (same lesson
 * as ToggleReactionAction).
 *
 * Authorization (caller is in the post's academy) lives in the
 * FormRequest; "the post is an event" check is the FormRequest's
 * job too — this Action assumes both are met.
 *
 * @phpstan-type RsvpResult array{
 *   your_rsvp: 'going'|'maybe'|null,
 *   counts: array{going: int, maybe: int}
 * }
 */
class ToggleRsvpAction
{
    /**
     * @return RsvpResult
     */
    public function execute(User $user, CommunityPost $post, RsvpResponse $response): array
    {
        $your = DB::transaction(function () use ($user, $post, $response): ?string {
            /** @var PostRsvp|null $existing */
            $existing = PostRsvp::query()
                ->where('post_id', $post->id)
                ->where('user_id', $user->id)
                ->sharedLock()
                ->first();

            if ($existing === null) {
                try {
                    PostRsvp::create([
                        'post_id' => $post->id,
                        'user_id' => $user->id,
                        'response' => $response,
                    ]);
                } catch (QueryException $e) {
                    if (! $this->isUniqueConstraintViolation($e)) {
                        throw $e;
                    }
                    /** @var PostRsvp $existing */
                    $existing = PostRsvp::query()
                        ->where('post_id', $post->id)
                        ->where('user_id', $user->id)
                        ->firstOrFail();
                    if ($existing->response !== $response) {
                        $existing->update(['response' => $response]);
                    }
                }

                return $response->value;
            }

            if ($existing->response === $response) {
                $existing->delete();

                return null;
            }

            $existing->update(['response' => $response]);

            return $response->value;
        });

        return [
            'your_rsvp' => $your,
            'counts' => $this->countsFor($post->id),
        ];
    }

    /**
     * @return array{going: int, maybe: int}
     */
    private function countsFor(int $postId): array
    {
        /** @var array<string, scalar> $rows */
        $rows = PostRsvp::query()
            ->where('post_id', $postId)
            ->selectRaw('response, COUNT(*) as n')
            ->groupBy('response')
            ->pluck('n', 'response')
            ->all();

        $going = $rows[RsvpResponse::Going->value] ?? 0;
        $maybe = $rows[RsvpResponse::Maybe->value] ?? 0;

        return [
            'going' => (int) $going,
            'maybe' => (int) $maybe,
        ];
    }

    private function isUniqueConstraintViolation(QueryException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
