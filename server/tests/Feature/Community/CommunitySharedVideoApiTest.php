<?php

declare(strict_types=1);

use App\Enums\CommunityPostType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Feature tests for `POST /api/v1/community/videos` (#1154, epic #1153) —
 * the first feed write open to athletes. Sharing an external technique video
 * (Instagram / YouTube / TikTok) creates a `shared_video` post with the
 * server-resolved preview. The provider oEmbed / OG calls are faked.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function videoAthlete(Academy $academy): User
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $u */
    $u = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $u->id]);

    return $u;
}

it('lets an athlete share a YouTube video into their academy feed', function (): void {
    Storage::fake('public');
    Http::fake([
        '*youtube.com/oembed*' => Http::response([
            'title' => 'Armbar from guard',
            'author_name' => 'BJJ Channel',
            'thumbnail_url' => 'https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg',
        ]),
        'https://i.ytimg.com/*' => Http::response('fake-jpeg-bytes', 200, ['Content-Type' => 'image/jpeg']),
    ]);
    $athlete = videoAthlete($this->academy);

    $response = $this->actingAs($athlete)
        ->postJson('/api/v1/community/videos', [
            'url' => 'https://www.youtube.com/watch?v=abc123XYZ',
            'caption' => 'Great detail on the grip',
        ])
        ->assertCreated();

    expect($response->json('data.type'))->toBe('shared_video')
        ->and($response->json('data.payload.provider'))->toBe('youtube')
        ->and($response->json('data.payload.video_id'))->toBe('abc123XYZ')
        ->and($response->json('data.payload.caption'))->toBe('Great detail on the grip')
        ->and($response->json('data.created_by.id'))->toBe($athlete->id);

    // Cover is cached + served from OUR domain, never hotlinked from the provider.
    $thumbnailUrl = $response->json('data.payload.thumbnail_url');
    expect($thumbnailUrl)->toContain('community/video-thumbnails/')
        ->and($thumbnailUrl)->not->toContain('ytimg.com')
        ->and($response->json('data.payload.thumbnail_path'))->toBeNull(); // internal path not exposed
    expect(Storage::disk('public')->files('community/video-thumbnails'))->toHaveCount(1);

    expect(
        CommunityPost::query()
            ->where('academy_id', $this->academy->id)
            ->where('type', CommunityPostType::SharedVideo)
            ->count(),
    )->toBe(1);
});

it('lets an owner share a TikTok video', function (): void {
    Storage::fake('public');
    Http::fake([
        '*tiktok.com/oembed*' => Http::response([
            'title' => 'Sweep drill',
            'author_name' => 'Coach',
            'thumbnail_url' => 'https://p16.tiktokcdn.com/x.jpg',
        ]),
        'https://p16.tiktokcdn.com/*' => Http::response('img', 200, ['Content-Type' => 'image/jpeg']),
    ]);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/videos', [
            'url' => 'https://www.tiktok.com/@coach/video/7123456789012345678',
        ])
        ->assertCreated()
        ->assertJsonPath('data.payload.provider', 'tiktok')
        ->assertJsonPath('data.payload.video_id', '7123456789012345678');
});

it('rejects a non-allowlisted URL with 422', function (): void {
    $athlete = videoAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson('/api/v1/community/videos', ['url' => 'https://vimeo.com/12345'])
        ->assertStatus(422);
});

it('rejects an allowlisted URL that fails to resolve with 422', function (): void {
    Http::fake(['*youtube.com/oembed*' => Http::response('', 404)]);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/videos', ['url' => 'https://www.youtube.com/watch?v=deleted9999'])
        ->assertStatus(422);
});

it('rejects an unauthenticated request with 401', function (): void {
    $this->postJson('/api/v1/community/videos', ['url' => 'https://www.youtube.com/watch?v=abc123XYZ'])
        ->assertStatus(401);
});

it('rejects a user who belongs to no academy with 403', function (): void {
    // An athlete-role user with no roster row resolves to no academy → the
    // membership gate (the first athlete-write boundary) denies the post.
    $orphan = User::factory()->create(['role' => 'athlete']);

    $this->actingAs($orphan)
        ->postJson('/api/v1/community/videos', ['url' => 'https://www.youtube.com/watch?v=abc123XYZ'])
        ->assertStatus(403);
});

it('caps the caption at 500 chars', function (): void {
    $athlete = videoAthlete($this->academy);

    $this->actingAs($athlete)
        ->postJson('/api/v1/community/videos', [
            'url' => 'https://www.youtube.com/watch?v=abc123XYZ',
            'caption' => str_repeat('a', 501),
        ])
        ->assertStatus(422);
});
