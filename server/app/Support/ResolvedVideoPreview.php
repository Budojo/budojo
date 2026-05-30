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
     * The persisted `community_posts.payload` shape. `$thumbnailPath` is OUR
     * cached cover (a relative `public`-disk path; the Resource resolves it to
     * a same-origin URL) — never the provider CDN URL, to keep the facade
     * cover first-party (#1155). Null metadata is omitted (a null thumbnail is
     * the degrade case — the card still renders, cover-less).
     *
     * @return array<string, mixed>
     */
    public function toPayload(?string $caption, ?string $thumbnailPath): array
    {
        return array_filter(
            [
                'provider' => $this->provider->value,
                'url' => $this->url,
                'video_id' => $this->videoId,
                'thumbnail_path' => $thumbnailPath,
                'title' => $this->title,
                'author_name' => $this->authorName,
                'caption' => $caption,
            ],
            static fn (mixed $value): bool => $value !== null,
        );
    }
}
