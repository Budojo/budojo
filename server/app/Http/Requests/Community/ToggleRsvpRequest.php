<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Enums\CommunityPostType;
use App\Enums\RsvpResponse;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\CommunityPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rules\Enum;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/rsvp`
 * (#605, M9 PR-E).
 *
 * Authorize gate: staff need `CommunityFeedInteract` in the post's
 * academy; athletes need to belong to it. Same shape as PR-C reactions.
 *
 * Validation:
 *
 * - `response` is required and a `RsvpResponse` enum case
 *   (`going` | `maybe`).
 * - The post's type MUST be `event` — RSVPing a belt-promotion
 *   celebration or an owner announcement makes no sense.
 *   Enforced via `withValidator` since the constraint is on the
 *   route-bound `post`, not the input payload.
 */
class ToggleRsvpRequest extends FormRequest
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

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'response' => ['required', new Enum(RsvpResponse::class)],
        ];
    }

    public function withValidator(\Illuminate\Contracts\Validation\Validator $validator): void
    {
        $validator->after(function ($v) {
            /** @var CommunityPost|null $post */
            $post = $this->route('post');
            if ($post instanceof CommunityPost && $post->type !== CommunityPostType::Event) {
                $v->errors()->add('response', 'rsvp_not_event_post');
            }
        });
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
