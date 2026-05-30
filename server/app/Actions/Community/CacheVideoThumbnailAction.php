<?php

declare(strict_types=1);

namespace App\Actions\Community;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Download a shared-video cover image and cache it on our `public` disk
 * (#1155, epic #1153) so the feed facade renders the cover **from our own
 * domain** — never hotlinking the provider CDN (which would leak the viewer's
 * IP, defeating the click-to-load privacy stance) and never relying on a
 * TikTok CDN URL that expires.
 *
 * Best-effort: any failure (unreachable, non-image, too large, write error)
 * returns `null` and the post degrades to a cover-less card. The source URL
 * comes from the provider's own oEmbed / OG response (not user input), and
 * the download is guarded by a timeout, a content-type check, and a size cap.
 */
class CacheVideoThumbnailAction
{
    private const int TIMEOUT_SECONDS = 6;

    private const int MAX_BYTES = 5 * 1024 * 1024;

    private const string DIR = 'community/video-thumbnails';

    public function execute(?string $thumbnailUrl): ?string
    {
        if ($thumbnailUrl === null) {
            return null;
        }

        $scheme = parse_url($thumbnailUrl, PHP_URL_SCHEME);
        if (! \in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)->get($thumbnailUrl);
        } catch (\Throwable) {
            return null;
        }

        if ($response->failed()) {
            return null;
        }

        $contentType = strtolower((string) $response->header('Content-Type'));
        if (! str_starts_with($contentType, 'image/')) {
            return null;
        }

        $bytes = $response->body();
        if ($bytes === '' || \strlen($bytes) > self::MAX_BYTES) {
            return null;
        }

        $path = self::DIR . '/' . Str::random(40) . '.' . $this->extensionFor($contentType);
        $stored = Storage::disk('public')->put($path, $bytes);

        return $stored === false ? null : $path;
    }

    private function extensionFor(string $contentType): string
    {
        return match (true) {
            str_contains($contentType, 'png') => 'png',
            str_contains($contentType, 'webp') => 'webp',
            str_contains($contentType, 'gif') => 'gif',
            default => 'jpg',
        };
    }
}
