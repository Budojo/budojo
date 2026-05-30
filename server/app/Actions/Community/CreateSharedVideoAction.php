<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Exceptions\InvalidVideoUrlException;
use App\Models\CommunityPost;
use App\Models\User;

/**
 * Create a `shared_video` community post (#1154, epic #1153) — an athlete or
 * owner sharing an external technique video (Instagram / YouTube / TikTok)
 * into their academy feed.
 *
 * Resolves the preview server-side via {@see ResolveVideoPreviewAction} (host
 * allowlist + provider metadata), then writes the post with the resolved
 * payload. Authorization (caller is a member of the academy with
 * `CommunityFeedInteract`) lives in the FormRequest.
 *
 * Eager-loads the same relations `CommunityPostResource` reads on a single
 * post (author flair + the caller-constrained reactions/rsvps placeholders)
 * so the controller echoes the wire shape on the 201 without a follow-up
 * query — mirrors {@see CreateEventAction}.
 *
 * @throws InvalidVideoUrlException when the URL is off-allowlist or its
 *   preview can't be resolved (the controller maps this to 422).
 */
class CreateSharedVideoAction
{
    public function __construct(
        private readonly ResolveVideoPreviewAction $resolver,
    ) {
    }

    public function execute(User $author, int $academyId, string $url, ?string $caption): CommunityPost
    {
        $preview = $this->resolver->execute($url);

        /** @var CommunityPost $post */
        $post = CommunityPost::create([
            'academy_id' => $academyId,
            'type' => CommunityPostType::SharedVideo,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => $preview->toPayload($caption),
            'created_by_user_id' => $author->id,
        ]);

        $post->load([
            'createdBy:id,first_name,last_name,handle,avatar_path,updated_at',
            'createdBy.athlete:id,user_id,belt',
            // Constrain to the author so the Resource's `$post->reactions->first()`
            // / `->rsvps->first()` reads an always-empty collection without a
            // lazy-load scan (same rationale as CreateEventAction).
            'reactions' => fn ($q) => $q->where('user_id', $author->id),
            'rsvps' => fn ($q) => $q->where('user_id', $author->id),
        ]);

        return $post;
    }
}
