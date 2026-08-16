<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Storage;

/**
 * `/storage/{path}` — the fallback that serves the `public` disk (#1302).
 *
 * Avatars, academy logos and community video thumbnails are emitted as
 * `Storage::disk('public')->url(...)`, which resolves to `APP_URL/storage/…`.
 * That path is normally a static file reached through the `public/storage`
 * symlink, and both nginx (`try_files $uri $uri/ /index.php`) and PHP's
 * built-in server serve an existing file before ever reaching the router — so
 * where the symlink exists these tests exercise a route that production never
 * hits.
 *
 * The desktop build is where it is NOT reachable: the install directory is
 * read-only, `storage/` is relocated to the per-user data directory, and
 * nothing creates the link. Every one of those images 404'd on the packaged
 * app until this route existed.
 *
 * No `RefreshDatabase` here on purpose — the route touches no models, and
 * saying so keeps the suite honest about what it is testing.
 */
beforeEach(function (): void {
    Storage::fake('public');
});

it('serves a file from the public disk', function (): void {
    Storage::disk('public')->put('avatars/matteo.png', 'png-bytes');

    $this->get('/storage/avatars/matteo.png')
        ->assertOk()
        ->assertStreamedContent('png-bytes');
});

it('serves a file from the root of the disk', function (): void {
    Storage::disk('public')->put('logo.png', 'root-bytes');

    $this->get('/storage/logo.png')
        ->assertOk()
        ->assertStreamedContent('root-bytes');
});

it('serves a deeply nested path', function (): void {
    Storage::disk('public')->put('community/thumbs/2026/08/clip.jpg', 'jpg-bytes');

    $this->get('/storage/community/thumbs/2026/08/clip.jpg')
        ->assertOk()
        ->assertStreamedContent('jpg-bytes');
});

it('sends a content type the browser can render', function (): void {
    Storage::disk('public')->put('avatars/matteo.png', 'png-bytes');

    $response = $this->get('/storage/avatars/matteo.png')->assertOk();

    expect($response->headers->get('Content-Type'))->toContain('image/png');
});

// An <img> tag sends no bearer token — the SPA's interceptor only decorates
// its own API calls. A route that required auth would 401 every image and be
// indistinguishable from the bug it replaces. These files are the `public`
// disk with `visibility: public`; until now nginx served them with no auth at
// all, so this is the existing posture, not a new hole.
it('does not require authentication', function (): void {
    Storage::disk('public')->put('avatars/matteo.png', 'png-bytes');

    $this->get('/storage/avatars/matteo.png')->assertOk();
});

it('404s a file that does not exist', function (): void {
    $this->get('/storage/avatars/nope.png')->assertNotFound();
});

// The other half of the fix, and the half worth a permanent guard.
//
// Laravel's skeleton ships `'serve' => true` on the `local` disk — the one
// rooted at storage/app/private, holding the encrypted medical certificates.
// That disk has no `url`, so the framework registers it at `/storage/{path}`
// by default, where it shadowed the public disk and made every avatar
// unreachable (#1302).
//
// It was never a data leak: ServeFile demands a valid signature for any disk
// whose visibility is not `public`. But "not currently exploitable" is a thin
// guarantee to leave resting on a config flag, and re-adding that flag would
// silently restore the outage. This test fails if anyone does.
it('does not serve the private disk over /storage', function (): void {
    Storage::fake('local');
    Storage::disk('local')->put('documents/medical.pdf', 'private-bytes');

    $response = $this->get('/storage/documents/medical.pdf');

    expect($response->getStatusCode())->not->toBe(200);
    expect($response->getContent())->not->toContain('private-bytes');
});

it('routes /storage at the public disk, not the private one', function (): void {
    $route = app('router')->getRoutes()->getByName('storage.public');

    expect($route)->not->toBeNull()
        ->and(app('router')->getRoutes()->getByName('storage.local'))->toBeNull();
});

// The reason this route needs tests at all. Serving a caller-supplied path
// from PHP is exactly where traversal bugs live, and the private disk holding
// the encrypted medical certificates sits one directory up from the public
// one.
it('refuses to escape the public disk', function (string $path): void {
    $this->get("/storage/{$path}")->assertNotFound();
})->with([
    'parent traversal' => '../.env',
    'deep traversal' => '../../.env',
    'traversal mid-path' => 'avatars/../../.env',
    'private disk' => '../private/documents/medical.pdf',
    'encoded traversal' => '..%2F..%2F.env',
    'double-encoded traversal' => '..%252F..%252F.env',
    'absolute path' => '/etc/passwd',
    'null byte' => "avatars/x\0.png",
]);
