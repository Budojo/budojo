<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\PostComment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for a comment (#604, M9 PR-D server). Mirrors the
 * `created_by` shape used by `CommunityPostResource` so the SPA can
 * reuse the identity-flair component for both surfaces (the
 * "Mario Rossi · @mariobjj · 🟦 Blue" line on each comment).
 */
class PostCommentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var PostComment $comment */
        $comment = $this->resource;
        $author = $comment->user;

        return [
            'id' => $comment->id,
            'post_id' => $comment->post_id,
            'body' => $comment->body,
            'created_at' => $comment->created_at?->toIso8601String(),
            'created_by' => [
                'id' => $author->id,
                'first_name' => $author->first_name,
                'last_name' => $author->last_name,
                'full_name' => $author->full_name,
                'handle' => $author->handle,
                'avatar_url' => $author->avatar_url,
                'belt' => $author->athlete?->belt?->value,
            ],
        ];
    }
}
