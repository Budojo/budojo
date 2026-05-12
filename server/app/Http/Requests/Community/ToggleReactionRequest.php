<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Enums\ReactionEmoji;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rules\Enum;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/reactions`
 * (#603, M9 PR-C).
 *
 * Authorization gate: the authenticated user must belong to the
 * post's academy. Owners read their owned academy id; athletes read
 * `$user->athlete->academy_id`. Reaction on a post in a different
 * academy → 403 (canonical envelope).
 *
 * Validation: `emoji` is required and must be one of the values on
 * the `ReactionEmoji` enum (clap / pray today). Unknown emojis →
 * 422.
 */
class ToggleReactionRequest extends FormRequest
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
            'emoji' => ['required', new Enum(ReactionEmoji::class)],
        ];
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
