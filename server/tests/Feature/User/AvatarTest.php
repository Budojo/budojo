<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Storage::fake('public');
});

it('uploads an avatar and returns a populated avatar_url', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('me.png', 512, 512);

    $response = $this->postJson('/api/v1/me/avatar', ['avatar' => $file]);

    $response->assertOk()
        ->assertJsonStructure(['data' => ['id', 'name', 'email', 'avatar_url']])
        ->assertJsonPath('data.id', $user->id);

    $payload = $response->json('data');
    expect($payload['avatar_url'])->toBeString();

    $user->refresh();
    expect($user->avatar_path)->toBe("users/avatars/{$user->id}.jpg");
    Storage::disk('public')->assertExists($user->avatar_path);
});

it('replaces a previous avatar and overwrites the stored file', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $first = UploadedFile::fake()->image('first.png', 400, 600);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $first])->assertOk();
    $firstPath = $user->refresh()->avatar_path;

    $second = UploadedFile::fake()->image('second.jpg', 600, 400);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $second])->assertOk();
    $secondPath = $user->refresh()->avatar_path;

    // Path is deterministic per user (`{id}.jpg`) so a replace overwrites
    // in place — no orphan file from the first upload.
    expect($firstPath)->toBe($secondPath);
    Storage::disk('public')->assertExists($secondPath);

    // Only one file lives in the directory after the replace.
    $files = Storage::disk('public')->files("users/avatars");
    expect($files)->toHaveCount(1);
});

it('rejects avatar files larger than 2MB', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $tooBig = UploadedFile::fake()->image('huge.png')->size(2049);

    $this->postJson('/api/v1/me/avatar', ['avatar' => $tooBig])
        ->assertStatus(422)
        ->assertJsonValidationErrors('avatar');
});

it('rejects avatar files with disallowed mime types', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $bad = UploadedFile::fake()->create('avatar.pdf', 100, 'application/pdf');

    $this->postJson('/api/v1/me/avatar', ['avatar' => $bad])
        ->assertStatus(422)
        ->assertJsonValidationErrors('avatar');
});

it('rejects an SVG avatar (image rule excludes svg by default)', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    // SVG goes through a separate sanitisation surface for the academy
    // logo; the avatar surface intentionally rejects it.
    $svg = UploadedFile::fake()->createWithContent(
        'avatar.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>',
    );

    $this->postJson('/api/v1/me/avatar', ['avatar' => $svg])
        ->assertStatus(422)
        ->assertJsonValidationErrors('avatar');
});

it('forbids upload without a bearer token', function (): void {
    $file = UploadedFile::fake()->image('me.png');

    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])
        ->assertUnauthorized();
});

it('removes the avatar and clears the path', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('me.png');
    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])->assertOk();
    $path = $user->refresh()->avatar_path;
    expect($path)->toBeString();

    $this->deleteJson('/api/v1/me/avatar')
        ->assertOk()
        ->assertJsonPath('data.avatar_url', null);

    expect($user->refresh()->avatar_path)->toBeNull();
    Storage::disk('public')->assertMissing($path);
});

it('returns the user envelope unchanged when deleting an avatar that does not exist', function (): void {
    // Idempotency mirrors the academy-logo behaviour: deleting a missing
    // avatar is a no-op success (200, avatar_url already null), so
    // refreshing the SPA doesn't paper over a stale toast with a 404.
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->deleteJson('/api/v1/me/avatar')
        ->assertOk()
        ->assertJsonPath('data.avatar_url', null);
});

it('persists the avatar_url on subsequent /auth/me reads', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('me.png');
    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])->assertOk();

    $me = $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonStructure(['data' => ['avatar_url']]);

    expect($me->json('data.avatar_url'))->toBeString();
});

it('exposes avatar_url as null on /auth/me when the user has not uploaded one', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.avatar_url', null);
});

it('produces a 256x256 JPEG regardless of the source dimensions or extension', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    // A non-square source — the action should center-crop to a square
    // before resizing to 256x256.
    $file = UploadedFile::fake()->image('huge.png', 1200, 800);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])->assertOk();

    $stored = Storage::disk('public')->get($user->refresh()->avatar_path);
    expect($stored)->toBeString();

    /** @var string $stored */
    $info = getimagesizefromstring($stored);
    expect($info)->not->toBeFalse();
    /** @var array{0: int, 1: int, 2: int} $info */
    expect($info[0])->toBe(256);
    expect($info[1])->toBe(256);
    expect($info[2])->toBe(IMAGETYPE_JPEG);
});
