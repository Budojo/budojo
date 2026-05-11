<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/comments`
 * (#604, M9 PR-D server).
 *
 * - Authorization: caller's academy must match the post's academy.
 * - Validation: `body` required, trimmed, 1-500 chars. The 500 cap
 *   matches the PRD's "short-form, conversational" intent — long
 *   replies belong in DMs (V2 surface) or events.
 */
class CreateCommentRequest extends FormRequest
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
        return [
            'body' => ['required', 'string', 'min:1', 'max:500'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('body') && \is_string($this->input('body'))) {
            $this->merge(['body' => trim($this->input('body'))]);
        }
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
