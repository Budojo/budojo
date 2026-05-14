<?php

declare(strict_types=1);

namespace App\Http\Requests\Community;

use App\Authorization\Capability;
use App\Enums\ReactionEmoji;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\CommunityPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rules\Enum;

/**
 * Authorize + validate `POST /api/v1/community/posts/{post}/reactions`
 * (#603, M9 PR-C).
 *
 * Authorization gate: staff need `CommunityFeedInteract` in the post's
 * academy; athletes need to belong to it. Reaction on a post in a
 * different academy → 403 (canonical envelope).
 *
 * Validation: `emoji` is required and must be one of the values on
 * the `ReactionEmoji` enum (clap / pray today). Unknown emojis →
 * 422.
 */
class ToggleReactionRequest extends FormRequest
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
            'emoji' => ['required', new Enum(ReactionEmoji::class)],
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
