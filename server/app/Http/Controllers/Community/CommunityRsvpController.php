<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\ToggleRsvpAction;
use App\Enums\RsvpResponse;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\ToggleRsvpRequest;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * RSVP surface for event posts (#605, M9 PR-E server).
 *
 * `POST /api/v1/community/posts/{post}/rsvp` — toggle the
 * authenticated user's RSVP on an event-type post. Body:
 * `{"response": "going" | "maybe"}`. Response carries the canonical
 * state for SPA optimistic-update reconciliation:
 *
 *   {
 *     "your_rsvp": "going" | "maybe" | null,
 *     "counts": { "going": int, "maybe": int }
 *   }
 *
 * Authorization (caller in same academy + post is an event) lives
 * in the FormRequest; the controller stays humble.
 */
class CommunityRsvpController extends Controller
{
    public function __construct(
        private readonly ToggleRsvpAction $toggleRsvp,
    ) {
    }

    public function toggle(ToggleRsvpRequest $request, CommunityPost $post): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var string $raw */
        $raw = $request->validated('response');
        $response = RsvpResponse::from($raw);

        $state = $this->toggleRsvp->execute($user, $post, $response);

        return response()->json($state);
    }
}
