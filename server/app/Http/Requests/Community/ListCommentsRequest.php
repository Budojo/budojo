<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `GET /api/v1/community/posts/{post}/comments`
 * (#604, M9 PR-D server). The caller's academy must match the
 * post's academy — tenant isolation.
 */
class ListCommentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        /** @var CommunityPost|null $post */
        $post = $this->route('post');
        if (! $post instanceof CommunityPost) {
            return false;
        }

        $callerAcademyId = $user->isOwner()
            ? $user->academy?->id
            : $user->athlete?->academy_id;

        if ($callerAcademyId === null) {
            return false;
        }

        return $callerAcademyId === $post->academy_id;
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
