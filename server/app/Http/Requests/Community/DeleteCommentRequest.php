<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Models\PostComment;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `DELETE /api/v1/community/comments/{comment}`
 * (#604, M9 PR-D server).
 *
 * Two paths to authorize:
 *
 * 1. **Author**: a user can always delete their own comment.
 * 2. **Owner**: the owner of the post's academy can delete any
 *    comment under any post in that academy (moderation).
 *
 * 403 otherwise (canonical envelope).
 */
class DeleteCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        /** @var PostComment|null $comment */
        $comment = $this->route('comment');
        if (! $comment instanceof PostComment) {
            return false;
        }

        // Author path — always allowed to delete own comment.
        if ($comment->user_id === $user->id) {
            return true;
        }

        // Owner-moderation path — the post's academy must be the
        // user's owned academy.
        if (! $user->isOwner()) {
            return false;
        }

        $ownedAcademyId = $user->academy?->id;
        if ($ownedAcademyId === null) {
            return false;
        }

        return $comment->post->academy_id === $ownedAcademyId;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
