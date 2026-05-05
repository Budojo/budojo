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
    // Path tracks the uploaded extension — server stores as-is (no
    // re-encode); the dashboard chip + profile card use CSS object-fit
    // to render the avatar inside a fixed circular frame.
    expect($user->avatar_path)->toBe("users/avatars/{$user->id}.png");
    Storage::disk('public')->assertExists($user->avatar_path);
});

it('replaces a previous avatar and unlinks the orphan file', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    // First upload: PNG → users/avatars/{id}.png
    $first = UploadedFile::fake()->image('first.png', 400, 600);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $first])->assertOk();
    $firstPath = $user->refresh()->avatar_path;

    // Second upload: same extension → overwrites in place
    $second = UploadedFile::fake()->image('second.png', 600, 400);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $second])->assertOk();
    $secondPath = $user->refresh()->avatar_path;

    // Same extension → same path → in-place overwrite, no orphan.
    expect($firstPath)->toBe($secondPath);
    Storage::disk('public')->assertExists($secondPath);

    // Only one file lives in the directory after the replace.
    $files = Storage::disk('public')->files('users/avatars');
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

it('stores the original image bytes (no server-side resize)', function (): void {
    // The stack's GD build supports PNG only — JPEG/WebP encoders aren't
    // compiled in, so server-side resize would either need a Dockerfile
    // change or pulling Intervention Image. We chose to mirror the
    // academy-logo flow and store the original bytes, with the SPA
    // rendering inside a fixed circular frame via CSS object-fit. This
    // test pins that contract: what the user uploads is what's on disk.
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('huge.png', 1200, 800);
    $this->postJson('/api/v1/me/avatar', ['avatar' => $file])->assertOk();

    $stored = Storage::disk('public')->get($user->refresh()->avatar_path);
    expect($stored)->toBeString();

    /** @var string $stored */
    $info = getimagesizefromstring($stored);
    expect($info)->not->toBeFalse();
    /** @var array{0: int, 1: int, 2: int} $info */
    // Same dimensions as the uploaded file — no transformation in flight.
    expect($info[0])->toBe(1200);
    expect($info[1])->toBe(800);
    expect($info[2])->toBe(IMAGETYPE_PNG);
});
