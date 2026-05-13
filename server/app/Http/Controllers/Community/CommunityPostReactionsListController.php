<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Http\Controllers\Controller;
use App\Http\Resources\PostReactionResource;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * `GET /api/v1/community/posts/{post}/reactions` — list every
 * reaction on a post with the reactor's identity flair (post-v2.9.0
 * feature: "voglio vedere chi ha messo cosa come Facebook").
 *
 * Academy-scoped: caller must be a member of the post's academy
 * (owner of the academy OR an athlete in it). Cross-academy reads
 * return 403.
 *
 * Paginated 20/page. The SPA opens a bottom-sheet (mobile) / dialog
 * (desktop) on tap of the reaction count and consumes this page;
 * subsequent pages append. Filtering by emoji happens client-side
 * — the small page size + the small number of emoji types makes
 * server-side filter overkill in V1.
 */
class CommunityPostReactionsListController extends Controller
{
    public function index(
        Request $request,
        CommunityPost $post,
    ): AnonymousResourceCollection|JsonResponse {
        /** @var User $user */
        $user = $request->user();

        $callerAcademyId = $user->isOwner()
            ? $user->academy?->id
            : $user->athlete?->academy_id;

        if ($callerAcademyId === null || $post->academy_id !== $callerAcademyId) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $reactions = $post->reactions()
            ->with([
                'user:id,first_name,last_name,handle,avatar_path,updated_at',
                'user.athlete:id,user_id,belt',
            ])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(20);

        return PostReactionResource::collection($reactions);
    }
}
