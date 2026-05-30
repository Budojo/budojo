<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\CreateSharedVideoAction;
use App\Exceptions\InvalidVideoUrlException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\CreateSharedVideoRequest;
use App\Http\Resources\CommunityPostResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * `POST /api/v1/community/videos` (#1154, epic #1153) — an athlete or owner
 * shares an external technique video (Instagram / YouTube / TikTok) into
 * their academy feed. The server resolves the preview, stores a
 * `shared_video` post, and returns the full CommunityPost wire shape.
 *
 * Authorization (academy membership + `CommunityFeedInteract`) lives in the
 * FormRequest; the controller stays humble.
 */
class CommunitySharedVideosController extends Controller
{
    public function __construct(
        private readonly CreateSharedVideoAction $createSharedVideo,
    ) {
    }

    public function store(CreateSharedVideoRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academyId = $request->academyId();
        // authorize() already guarantees non-null; PHPStan-friendly re-assertion.
        if ($academyId === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        /** @var array{url: string, caption?: string|null} $data */
        $data = $request->validated();

        try {
            $post = $this->createSharedVideo->execute(
                $user,
                $academyId,
                $data['url'],
                $data['caption'] ?? null,
            );
        } catch (InvalidVideoUrlException) {
            return response()->json(['message' => 'We could not read that video link.'], 422);
        }

        return response()->json(['data' => new CommunityPostResource($post)], 201);
    }
}
