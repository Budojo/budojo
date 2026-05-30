<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\VideoProvider;

/**
 * The metadata a {@see \App\Actions\Community\ResolveVideoPreviewAction}
 * pulls for a shared video (#1153) — provider + canonical url + the bits the
 * feed card renders. Immutable; the create Action turns it into the
 * `community_posts.payload` for a `shared_video` post.
 */
final readonly class ResolvedVideoPreview
{
    public function __construct(
        public VideoProvider $provider,
        public string $url,
        public string $videoId,
        public ?string $thumbnailUrl = null,
        public ?string $title = null,
        public ?string $authorName = null,
    ) {
    }

    /**
     * The persisted `community_posts.payload` shape. Null metadata is omitted
     * (a missing thumbnail is the IG degrade case — the card still renders).
     *
     * @return array<string, mixed>
     */
    public function toPayload(?string $caption): array
    {
        return array_filter(
            [
                'provider' => $this->provider->value,
                'url' => $this->url,
                'video_id' => $this->videoId,
                'thumbnail_url' => $this->thumbnailUrl,
                'title' => $this->title,
                'author_name' => $this->authorName,
                'caption' => $caption,
            ],
            static fn (mixed $value): bool => $value !== null,
        );
    }
}
