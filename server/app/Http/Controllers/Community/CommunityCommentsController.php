<?php

declare(strict_types=1);

namespace App\Http\Controllers\Community;

use App\Actions\Community\CreateCommentAction;
use App\Actions\Community\DeleteCommentAction;
use App\Actions\Community\ListCommentsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Community\CreateCommentRequest;
use App\Http\Requests\Community\DeleteCommentRequest;
use App\Http\Requests\Community\ListCommentsRequest;
use App\Http\Resources\PostCommentResource;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Community comments surface (#604, M9 PR-D server).
 *
 * - `GET /api/v1/community/posts/{post}/comments` — paginated list
 *   (50/page) of comments on a post, ascending-created-at.
 * - `POST /api/v1/community/posts/{post}/comments` — create a 1-level
 *   comment ({body: string}). Returns the created resource.
 * - `DELETE /api/v1/community/comments/{comment}` — soft-delete by
 *   author OR by the owner of the post's academy.
 *
 * Authorization sits in the FormRequests; controller stays humble.
 */
class CommunityCommentsController extends Controller
{
    public function __construct(
        private readonly ListCommentsAction $list,
        private readonly CreateCommentAction $create,
        private readonly DeleteCommentAction $delete,
    ) {
    }

    public function index(ListCommentsRequest $request, CommunityPost $post): AnonymousResourceCollection
    {
        $page = $this->list->execute($post);

        return PostCommentResource::collection($page);
    }

    public function store(CreateCommentRequest $request, CommunityPost $post): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var string $body */
        $body = $request->validated('body');

        $comment = $this->create->execute($post, $user, $body);

        return response()->json(['data' => new PostCommentResource($comment)], 201);
    }

    public function destroy(DeleteCommentRequest $request, PostComment $comment): Response
    {
        $this->delete->execute($comment);

        return response()->noContent();
    }
}
