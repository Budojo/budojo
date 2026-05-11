<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\CommunityPost;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for a single community post (#612, M9 PR-B server). The
 * SPA consumes this in two surfaces:
 *
 * - `/dashboard/me/feed` — the athlete-portal timeline (PR-B2 client).
 * - The owner-side moderation view (no UI yet — owners view + delete
 *   posts via the same payload in V2 when they need to moderate).
 *
 * `created_by` carries the author's identity flair shape so the SPA's
 * `<app-user-flair>` component (PR-D) can render the
 * "Mario Rossi · @mariobjj · 🟦 Blue" line. Belt comes from the
 * linked athlete row; for owner-authored posts (events,
 * announcements) the `belt` field is null and the SPA renders the
 * owner variant of the flair.
 *
 * Reactions / comments / rsvps counts are surfaced from the
 * `withCount()` aggregations the Action eager-loads. PR-C (reactions)
 * and PR-D (comments) will start surfacing non-zero values; today
 * they're all zero.
 */
class CommunityPostResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CommunityPost $post */
        $post = $this->resource;

        $author = $post->createdBy;

        return [
            'id' => $post->id,
            'type' => $post->type->value,
            'visibility' => $post->visibility->value,
            'payload' => $post->payload,
            'created_at' => $post->created_at?->toIso8601String(),
            'created_by' => [
                'id' => $author->id,
                'first_name' => $author->first_name,
                'last_name' => $author->last_name,
                'full_name' => $author->full_name,
                'handle' => $author->handle,
                'avatar_url' => $author->avatar_url,
                // Athletes carry a belt via their linked row; owners
                // don't. Surface as null when no athlete row exists so
                // the SPA renders the owner flair variant.
                'belt' => $author->athlete?->belt?->value,
            ],
            'reactions_count' => $post->reactions_count ?? 0,
            'comments_count' => $post->comments_count ?? 0,
            'rsvps_count' => $post->rsvps_count ?? 0,
        ];
    }
}
