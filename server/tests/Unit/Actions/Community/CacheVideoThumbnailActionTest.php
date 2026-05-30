<?php

declare(strict_types=1);

use App\Actions\Community\CacheVideoThumbnailAction;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Slice 2 (#1155, epic #1153) — caches the provider cover image on our public
 * disk so the feed facade renders it first-party (no hotlink → no viewer-IP
 * leak; no expiring CDN URL). Best-effort: any failure degrades to null.
 */
beforeEach(function (): void {
    Storage::fake('public');
    $this->action = app(CacheVideoThumbnailAction::class);
});

it('downloads an image and stores it on the public disk', function (): void {
    Http::fake(['https://cdn.test/*' => Http::response('jpeg-bytes', 200, ['Content-Type' => 'image/jpeg'])]);

    $path = $this->action->execute('https://cdn.test/cover.jpg');

    expect($path)->toStartWith('community/video-thumbnails/')->toEndWith('.jpg');
    Storage::disk('public')->assertExists($path);
});

it('picks the file extension from the content type', function (): void {
    Http::fake(['https://cdn.test/*' => Http::response('png-bytes', 200, ['Content-Type' => 'image/png'])]);

    expect($this->action->execute('https://cdn.test/x'))->toEndWith('.png');
});

it('returns null for a non-image response', function (): void {
    Http::fake(['https://cdn.test/*' => Http::response('<html>', 200, ['Content-Type' => 'text/html'])]);

    expect($this->action->execute('https://cdn.test/page'))->toBeNull();
});

it('returns null for an oversized image', function (): void {
    Http::fake(['https://cdn.test/*' => Http::response(str_repeat('x', 6 * 1024 * 1024), 200, ['Content-Type' => 'image/jpeg'])]);

    expect($this->action->execute('https://cdn.test/huge.jpg'))->toBeNull();
});

it('returns null on a failed fetch', function (): void {
    Http::fake(['https://cdn.test/*' => Http::response('', 404)]);

    expect($this->action->execute('https://cdn.test/gone.jpg'))->toBeNull();
});

it('returns null when there is no thumbnail to cache', function (): void {
    expect($this->action->execute(null))->toBeNull();
});

it('returns null for a non-http(s) URL', function (): void {
    expect($this->action->execute('ftp://cdn.test/x.jpg'))->toBeNull();
});
