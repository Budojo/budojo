<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Enums\CommunityPostType;
use App\Enums\RsvpResponse;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rules\Enum;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/rsvp`
 * (#605, M9 PR-E).
 *
 * Authorize gate:
 *
 * - Caller is authenticated.
 * - Caller's academy id matches the post's academy id (tenant
 *   isolation, same as PR-C reactions).
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

        $callerAcademyId = $this->callerAcademyId($user);
        if ($callerAcademyId === null) {
            return false;
        }

        return $callerAcademyId === $post->academy_id;
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

    private function callerAcademyId(User $user): ?int
    {
        if ($user->isOwner()) {
            return $user->academy?->id;
        }
        /** @var Athlete|null $athlete */
        $athlete = $user->athlete;

        return $athlete?->academy_id;
    }
}
