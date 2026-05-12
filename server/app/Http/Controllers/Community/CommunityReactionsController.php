<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\ToggleReactionAction;
use App\Enums\ReactionEmoji;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\ToggleReactionRequest;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Reactions surface (#603, M9 PR-C server).
 *
 * `POST /api/v1/community/posts/{post}/reactions` — toggle the
 * authenticated user's emoji reaction on the given post. The body
 * payload is `{"emoji": "clap"|"pray"}`. The response carries the
 * resulting state so the SPA can reconcile its optimistic update in
 * one roundtrip:
 *
 *   {
 *     "your_reaction": "clap"|"pray"|null,
 *     "counts": { "clap": int, "pray": int }
 *   }
 *
 * Authorization (caller belongs to the post's academy) sits in the
 * FormRequest; this controller is a humble orchestrator.
 */
class CommunityReactionsController extends Controller
{
    public function __construct(
        private readonly ToggleReactionAction $toggleReaction,
    ) {
    }

    public function toggle(ToggleReactionRequest $request, CommunityPost $post): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var string $rawEmoji */
        $rawEmoji = $request->validated('emoji');
        $emoji = ReactionEmoji::from($rawEmoji);

        $state = $this->toggleReaction->execute($user, $post, $emoji);

        return response()->json($state);
    }
}
