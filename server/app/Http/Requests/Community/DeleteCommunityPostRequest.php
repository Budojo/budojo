<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize gate for `DELETE /api/v1/community/posts/{post}` (#612,
 * M9 PR-B). Two conditions must hold for a 204:
 *
 * 1. The authenticated user is an owner (`role = owner`). Athletes
 *    can read the feed and (later, PR-D) post comments, but never
 *    delete posts — moderation is the owner's responsibility per
 *    the PRD's hard rule.
 *
 * 2. The post belongs to the owner's academy. Cross-academy delete
 *    attempts surface as 403 (FormRequest authorize → AuthorizationException),
 *    not as 404 — we want the actor to know the route exists but
 *    they lack the permission, while preserving tenant isolation
 *    (they don't learn anything about posts in academies they don't
 *    own).
 */
class DeleteCommunityPostRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null || ! $user->isOwner()) {
            return false;
        }

        $ownedAcademyId = $user->academy?->id;
        if ($ownedAcademyId === null) {
            return false;
        }

        /** @var CommunityPost|null $post */
        $post = $this->route('post');
        if (! $post instanceof CommunityPost) {
            return false;
        }

        return $post->academy_id === $ownedAcademyId;
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
