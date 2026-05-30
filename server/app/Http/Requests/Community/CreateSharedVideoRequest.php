<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Enums\UserRole;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\User;
use App\Rules\AllowlistedVideoUrl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Authorize + validate `POST /api/v1/community/videos` (#1154).
 *
 * Authorization: the caller posts into their **own** academy, gated like the
 * other feed interactions (reactions / comments) — staff need
 * `CommunityFeedInteract`, athletes need to belong to the academy. This is
 * the first feed write open to athletes.
 *
 * Validation:
 * - `url` required, must parse as a URL on the provider allowlist
 *   (Instagram / YouTube / TikTok) — see {@see AllowlistedVideoUrl}.
 * - `caption` optional, max 500 chars (the sharer's own note).
 */
class CreateSharedVideoRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        $academyId = $this->academyId();
        if ($academyId === null) {
            return false;
        }

        return $this->authorizeAcademyMembership($academyId, Capability::CommunityFeedInteract);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'url' => ['required', 'string', 'url', 'max:2048', new AllowlistedVideoUrl()],
            'caption' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * The caller's own academy — athletes via their roster row, staff via
     * their active academy. Shared by `authorize()` and the controller.
     */
    public function academyId(): ?int
    {
        $user = $this->user();
        if (! $user instanceof User) {
            return null;
        }

        return $user->role === UserRole::Athlete
            ? $user->athlete?->academy_id
            : $user->activeAcademyId();
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('caption') && \is_string($this->input('caption'))) {
            $this->merge(['caption' => trim($this->input('caption'))]);
        }
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
