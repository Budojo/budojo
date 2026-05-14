<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\CreateEventAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\CreateEventRequest;
use App\Http\Resources\CommunityPostResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Owner-facing event-creation surface (M9 PR-G — unblocks PR-F
 * slice 2's community_event_new notification trigger). V1 ships
 * create only; future surfaces (edit / cancel) follow when the
 * owner UI grows past the minimum.
 *
 * `POST /api/v1/community/events` — owner creates an event post in
 * their own academy. Body: title + starts_at (required), description
 * + location_text + location_lat/_lon + max_attendees (optional).
 * Returns 201 with the full CommunityPost wire shape.
 *
 * Authorization gate (caller is `isOwner()` + has a linked academy)
 * lives in the FormRequest; controller stays humble.
 */
class CommunityEventsController extends Controller
{
    public function __construct(
        private readonly CreateEventAction $createEvent,
    ) {
    }

    public function store(CreateEventRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();
        // authorize() already guarantees non-null; this is a
        // PHPStan-friendly re-assertion.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        /** @var array{
         *     title: string,
         *     starts_at: string,
         *     description?: string|null,
         *     location_text?: string|null,
         *     location_lat?: float|null,
         *     location_lon?: float|null,
         *     max_attendees?: int|null,
         * } $payload */
        $payload = $request->validated();
        $post = $this->createEvent->execute($user, $academy->id, $payload);

        return response()->json(['data' => new CommunityPostResource($post)], 201);
    }
}
