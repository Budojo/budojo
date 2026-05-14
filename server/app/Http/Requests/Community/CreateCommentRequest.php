<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\CommunityPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/comments`
 * (#604, M9 PR-D server).
 *
 * - Authorization: staff need `CommunityFeedInteract` in the post's
 *   academy; athletes need to belong to it.
 * - Validation: `body` required, trimmed, 1-500 chars. The 500 cap
 *   matches the PRD's "short-form, conversational" intent — long
 *   replies belong in DMs (V2 surface) or events.
 */
class CreateCommentRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        /** @var CommunityPost|null $post */
        $post = $this->route('post');
        if (! $post instanceof CommunityPost) {
            return false;
        }

        return $this->authorizeAcademyMembership($post->academy_id, Capability::CommunityFeedInteract);
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
