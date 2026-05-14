<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\CommunityPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `DELETE /api/v1/community/posts/{post}` (#612,
 * M9 PR-B). Capability gate (`CommunityPostEvent` in the post's
 * academy): only roles that can POST events can also delete them —
 * Owner / Admin / Instructor. Assistants and athletes are read-only
 * on the moderation surface.
 */
class DeleteCommunityPostRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        /** @var CommunityPost|null $post */
        $post = $this->route('post');
        if (! $post instanceof CommunityPost) {
            return false;
        }

        return $this->authorizeInAcademy($post->academy_id, Capability::CommunityPostEvent);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }

    /**
     * Match the canonical wire-level 403 envelope used by every other
     * write FormRequest in the codebase (StoreAthleteRequest,
     * UpdateAcademyRequest, MarkAttendanceRequest, …):
     * `{"message":"Forbidden."}`. Without this override, Laravel falls
     * back to "This action is unauthorized.", which mismatches both
     * `docs/api/v1.yaml#components.schemas.ErrorMessage` and the SPA's
     * uniform 403 handler.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
