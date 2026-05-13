<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\PostReaction;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for one reaction row in the post-reactions list
 * (post-v2.9.0). Mirrors `CommunityPostAuthor` for the reactor
 * identity so the SPA can reuse `<app-user-flair>` to render the
 * "Mario Rossi · @mariobjj · 🟦 Blue · 👏" line.
 */
class PostReactionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var PostReaction $reaction */
        $reaction = $this->resource;
        $user = $reaction->user;

        return [
            'id' => $reaction->id,
            'emoji' => $reaction->emoji->value,
            'created_at' => $reaction->created_at?->toIso8601String(),
            'user' => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'full_name' => trim($user->first_name . ' ' . $user->last_name),
                'handle' => $user->handle,
                'avatar_url' => $user->avatar_url,
                // Athletes carry a belt via their linked row; owners
                // don't. Null on owner reactions — SPA flair switches
                // to the owner variant.
                'belt' => $user->athlete?->belt?->value,
            ],
        ];
    }
}
