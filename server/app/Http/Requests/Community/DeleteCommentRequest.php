<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\PostComment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `DELETE /api/v1/community/comments/{comment}`
 * (#604, M9 PR-D server).
 *
 * Two paths to authorize:
 *
 * 1. **Author**: a user can always delete their own comment.
 * 2. **Moderator**: any staff member with `CommunityPostEvent` in the
 *    post's academy can moderate a comment under that post —
 *    Owner / Admin / Instructor per the matrix. Assistants are
 *    read-only and athletes can only delete their own.
 *
 * 403 otherwise (canonical envelope).
 */
class DeleteCommentRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
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

        // `withTrashed()` because the parent post may have been
        // soft-deleted (PR-B's owner moderation surface) while its
        // comments still exist. Without this the default
        // `belongsTo` returns null on a trashed post and
        // `->academy_id` would 500 — Copilot review on PR #621.
        $post = $comment->post()->withTrashed()->first();
        if ($post === null) {
            return false;
        }

        return $this->authorizeInAcademy($post->academy_id, Capability::CommunityPostEvent);
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
