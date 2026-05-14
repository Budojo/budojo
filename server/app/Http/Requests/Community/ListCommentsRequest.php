<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\CommunityPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `GET /api/v1/community/posts/{post}/comments`
 * (#604, M9 PR-D server). Staff need `CommunityFeedInteract`; athletes
 * need to belong to the post's academy.
 */
class ListCommentsRequest extends FormRequest
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
        return [];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
