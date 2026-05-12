<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\DeleteCommunityPostAction;
use App\Actions\Community\GetCommunityFeedAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\DeleteCommunityPostRequest;
use App\Http\Resources\CommunityPostResource;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Community feed surface (#612, M9 PR-B server). Two endpoints:
 *
 * - `GET /api/v1/community/feed` — read the authenticated user's
 *   academy timeline, 20 per page. Athletes and owners hit the same
 *   endpoint; the Action resolves their academy from the user role.
 *
 * - `DELETE /api/v1/community/posts/{post}` — owner-only soft-delete.
 *   Authorization lives in the FormRequest so the controller stays a
 *   humble orchestrator.
 */
class CommunityFeedController extends Controller
{
    public function __construct(
        private readonly GetCommunityFeedAction $getFeed,
        private readonly DeleteCommunityPostAction $deletePost,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        $page = $this->getFeed->execute($user);

        return CommunityPostResource::collection($page);
    }

    public function destroy(DeleteCommunityPostRequest $request, CommunityPost $post): Response
    {
        $this->deletePost->execute($post);

        return response()->noContent();
    }
}
