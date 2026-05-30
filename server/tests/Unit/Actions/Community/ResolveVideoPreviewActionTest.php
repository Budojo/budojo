<?php

declare(strict_types=1);

use App\Actions\Community\ResolveVideoPreviewAction;
use App\Enums\VideoProvider;
use App\Exceptions\InvalidVideoUrlException;
use Illuminate\Support\Facades\Http;

/**
 * Slice 1 (#1154, epic #1153) — server-side preview resolver for shared
 * videos. Validates the URL against the host allowlist (the SSRF boundary)
 * then pulls metadata: YouTube + TikTok oEmbed, Instagram crawler-UA OG.
 */
beforeEach(function (): void {
    $this->action = app(ResolveVideoPreviewAction::class);
});

it('resolves a YouTube watch URL via oEmbed', function (): void {
    Http::fake([
        '*youtube.com/oembed*' => Http::response([
            'title' => 'Armbar from guard',
            'author_name' => 'BJJ Channel',
            'thumbnail_url' => 'https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg',
        ]),
    ]);

    $preview = $this->action->execute('https://www.youtube.com/watch?v=abc123XYZ');

    expect($preview->provider)->toBe(VideoProvider::YouTube)
        ->and($preview->videoId)->toBe('abc123XYZ')
        ->and($preview->title)->toBe('Armbar from guard')
        ->and($preview->authorName)->toBe('BJJ Channel')
        ->and($preview->thumbnailUrl)->toBe('https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg');
});

it('resolves a youtu.be short URL', function (): void {
    Http::fake(['*youtube.com/oembed*' => Http::response(['title' => 'X', 'thumbnail_url' => 'https://t/x.jpg'])]);

    expect($this->action->execute('https://youtu.be/XYZ789abc-_')->videoId)->toBe('XYZ789abc-_');
});

it('resolves a YouTube Shorts URL', function (): void {
    Http::fake(['*youtube.com/oembed*' => Http::response(['title' => 'X', 'thumbnail_url' => 'https://t/x.jpg'])]);

    expect($this->action->execute('https://www.youtube.com/shorts/Sh0rtsId12')->videoId)->toBe('Sh0rtsId12');
});

it('resolves a TikTok URL via oEmbed', function (): void {
    Http::fake([
        '*tiktok.com/oembed*' => Http::response([
            'title' => 'Sweep drill',
            'author_name' => 'Coach',
            'thumbnail_url' => 'https://p16.tiktokcdn.com/x.jpg',
        ]),
    ]);

    $preview = $this->action->execute('https://www.tiktok.com/@coach/video/7123456789012345678');

    expect($preview->provider)->toBe(VideoProvider::TikTok)
        ->and($preview->videoId)->toBe('7123456789012345678')
        ->and($preview->title)->toBe('Sweep drill')
        ->and($preview->thumbnailUrl)->toBe('https://p16.tiktokcdn.com/x.jpg');
});

it('resolves an Instagram reel via OG tags', function (): void {
    Http::fake([
        '*instagram.com/*' => Http::response(
            '<html><head>'
            . '<meta property="og:image" content="https://cdninstagram.com/ig.jpg" />'
            . '<meta property="og:title" content="Triangle setup" />'
            . '</head></html>',
        ),
    ]);

    $preview = $this->action->execute('https://www.instagram.com/reel/C8xYz_abc/');

    expect($preview->provider)->toBe(VideoProvider::Instagram)
        ->and($preview->videoId)->toBe('C8xYz_abc')
        ->and($preview->thumbnailUrl)->toBe('https://cdninstagram.com/ig.jpg')
        ->and($preview->title)->toBe('Triangle setup');
});

it('rejects a non-allowlisted host (SSRF guard)', function (): void {
    $this->action->execute('https://evil.test/video/1');
})->throws(InvalidVideoUrlException::class);

it('rejects a look-alike host (youtube.com.evil.test)', function (): void {
    $this->action->execute('https://youtube.com.evil.test/watch?v=x');
})->throws(InvalidVideoUrlException::class);

it('rejects a userinfo-spoofed host (instagram.com@internal-ip)', function (): void {
    // parse_url takes the real host after `@` (169.254.169.254), not the
    // userinfo — so the allowlist rejects it (no SSRF to link-local).
    $this->action->execute('https://instagram.com@169.254.169.254/reel/x');
})->throws(InvalidVideoUrlException::class);

it('caps the Instagram body read at the size limit', function (): void {
    // og:image placed AFTER the 2 MB cap. A bounded read stops before
    // reaching it → thumbnailUrl is null. Drop the cap and the tag leaks
    // through — so this fails if the bound regresses (vs. an up-front tag,
    // which would pass with no cap at all).
    $body = str_repeat('x', 2 * 1024 * 1024 + 1024)
        . '<meta property="og:image" content="https://cdninstagram.com/late.jpg" />';
    Http::fake(['*instagram.com/*' => Http::response($body)]);

    $preview = $this->action->execute('https://www.instagram.com/reel/CapTest123/');

    expect($preview->videoId)->toBe('CapTest123')
        ->and($preview->thumbnailUrl)->toBeNull();
});

it('rejects an allowlisted URL whose provider returns an error', function (): void {
    Http::fake(['*youtube.com/oembed*' => Http::response('', 404)]);

    $this->action->execute('https://www.youtube.com/watch?v=deleted9999');
})->throws(InvalidVideoUrlException::class);

it('rejects a malformed URL', function (): void {
    $this->action->execute('not a url at all');
})->throws(InvalidVideoUrlException::class);
