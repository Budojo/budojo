<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\VideoProvider;
use App\Exceptions\InvalidVideoUrlException;
use App\Support\ResolvedVideoPreview;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Resolve a shared-video URL (#1153) into a {@see ResolvedVideoPreview}:
 * validate the host against the {@see VideoProvider} allowlist (the SSRF
 * boundary), extract the video id, and pull display metadata from the
 * provider — YouTube + TikTok oEmbed, Instagram crawler-UA OG tags.
 *
 * **SSRF posture:** the resolver only ever fetches the three fixed public
 * oEmbed / page hosts. A caller can't steer the request at an internal
 * address — the allowlisted domains aren't attacker-controlled, so DNS
 * rebinding is a non-issue. Redirects are NOT followed (a 30x can't carry
 * the fetch off-host), and every request carries a short timeout.
 *
 * **Instagram degrade:** a public reel whose OG tags aren't readable (login
 * wall / private) still yields a valid preview with a null thumbnail — the
 * feed card degrades to "cover-less + Open on Instagram" rather than failing
 * the whole share. Only a missing shortcode or an HTTP error rejects it.
 *
 * @throws InvalidVideoUrlException when the URL is off-allowlist, malformed,
 *   or its preview can't be resolved (deleted / provider error).
 */
class ResolveVideoPreviewAction
{
    private const int TIMEOUT_SECONDS = 6;

    /** Bound the user-influenced IG page read so a hostile/huge body can't be slurped into memory. */
    private const int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

    /** Instagram serves `og:` tags to link-preview bots, not to plain clients. */
    private const string CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

    public function execute(string $url): ResolvedVideoPreview
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! \is_string($host) || $host === '') {
            throw new InvalidVideoUrlException('Malformed video URL.');
        }

        $provider = VideoProvider::fromHost($host);
        if ($provider === null) {
            throw new InvalidVideoUrlException('Unsupported video provider.');
        }

        return match ($provider) {
            VideoProvider::YouTube => $this->resolveYouTube($url),
            VideoProvider::TikTok => $this->resolveTikTok($url),
            VideoProvider::Instagram => $this->resolveInstagram($url),
        };
    }

    private function resolveYouTube(string $url): ResolvedVideoPreview
    {
        $videoId = $this->firstMatch($url, [
            '#youtube\.com/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})#',
            '#youtu\.be/([A-Za-z0-9_-]{6,})#',
            '#youtube\.com/shorts/([A-Za-z0-9_-]{6,})#',
            '#youtube\.com/embed/([A-Za-z0-9_-]{6,})#',
        ]) ?? throw new InvalidVideoUrlException('Could not read the YouTube video id.');

        $data = $this->oembed('https://www.youtube.com/oembed', $url);

        return new ResolvedVideoPreview(
            provider: VideoProvider::YouTube,
            url: $url,
            videoId: $videoId,
            thumbnailUrl: $this->str($data, 'thumbnail_url'),
            title: $this->str($data, 'title'),
            authorName: $this->str($data, 'author_name'),
        );
    }

    private function resolveTikTok(string $url): ResolvedVideoPreview
    {
        $data = $this->oembed('https://www.tiktok.com/oembed', $url);

        $videoId = $this->firstMatch($url, ['#tiktok\.com/@[^/]+/video/(\d{6,})#'])
            ?? $this->str($data, 'embed_product_id')
            ?? throw new InvalidVideoUrlException('Could not read the TikTok video id.');

        return new ResolvedVideoPreview(
            provider: VideoProvider::TikTok,
            url: $url,
            videoId: $videoId,
            thumbnailUrl: $this->str($data, 'thumbnail_url'),
            title: $this->str($data, 'title'),
            authorName: $this->str($data, 'author_name'),
        );
    }

    private function resolveInstagram(string $url): ResolvedVideoPreview
    {
        $shortcode = $this->firstMatch($url, ['#instagram\.com/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)#'])
            ?? throw new InvalidVideoUrlException('Could not read the Instagram shortcode.');

        $html = $this->fetchHtml($url);

        return new ResolvedVideoPreview(
            provider: VideoProvider::Instagram,
            url: $url,
            videoId: $shortcode,
            thumbnailUrl: $this->ogTag($html, 'og:image'),
            title: $this->ogTag($html, 'og:title'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function oembed(string $endpoint, string $videoUrl): array
    {
        $response = $this->get($endpoint, ['url' => $videoUrl, 'format' => 'json']);
        if ($response->failed()) {
            throw new InvalidVideoUrlException("Provider returned {$response->status()}.");
        }

        $json = $response->json();
        if (! \is_array($json)) {
            throw new InvalidVideoUrlException('Provider returned a non-JSON oEmbed response.');
        }

        /** @var array<string, mixed> $json */
        return $json;
    }

    private function fetchHtml(string $url): string
    {
        $response = $this->get($url, stream: true);
        // 4xx/5xx = deleted / blocked → reject. A 2xx/3xx with no OG tags is
        // the degrade case, handled by the caller (null thumbnail).
        if ($response->status() >= 400) {
            throw new InvalidVideoUrlException("Instagram returned {$response->status()}.");
        }

        // Read at most MAX_RESPONSE_BYTES — the body is the only user-influenced
        // fetch target, so cap it pre-emptively rather than buffering an
        // unbounded response into memory (the timeout alone doesn't bound size).
        $stream = $response->toPsrResponse()->getBody();
        $html = '';
        while (! $stream->eof() && \strlen($html) < self::MAX_RESPONSE_BYTES) {
            $html .= $stream->read(8192);
        }
        $stream->close();

        return $html;
    }

    /**
     * @param array<string, scalar> $query
     */
    private function get(string $url, array $query = [], bool $stream = false): Response
    {
        try {
            $request = Http::timeout(self::TIMEOUT_SECONDS)
                ->withoutRedirecting()
                ->withHeaders(['User-Agent' => self::CRAWLER_UA]);

            if ($stream) {
                // Don't eager-buffer the whole body — fetchHtml() reads it
                // bounded so a huge response is truncated, not slurped.
                $request = $request->withOptions(['stream' => true]);
            }

            return $request->get($url, $query);
        } catch (ConnectionException $e) {
            throw new InvalidVideoUrlException('Could not reach the video provider.', previous: $e);
        }
    }

    /**
     * @param list<string> $patterns
     */
    private function firstMatch(string $subject, array $patterns): ?string
    {
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $subject, $matches) === 1) {
                return $matches[1];
            }
        }

        return null;
    }

    private function ogTag(string $html, string $property): ?string
    {
        $prop = preg_quote($property, '#');
        $orders = [
            '#<meta[^>]+property=["\']' . $prop . '["\'][^>]+content=["\']([^"\']*)["\']#i',
            '#<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']' . $prop . '["\']#i',
        ];

        foreach ($orders as $pattern) {
            if (preg_match($pattern, $html, $matches) === 1 && $matches[1] !== '') {
                return html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5);
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function str(array $data, string $key): ?string
    {
        $value = $data[$key] ?? null;

        return (\is_string($value) && $value !== '') ? $value : null;
    }
}
