<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Athlete photo (#1357).
 *
 * An athlete had no photo of its own: the picture in the list came from a
 * linked user account, and `athlete_accounts` is absent from the desktop
 * runtime — so on the shipped build an athlete could never have one at all.
 *
 * What is worth testing exhaustively here is the **refusals** and the
 * **scoping**. An upload endpoint is a way to write arbitrary bytes into the
 * public disk under a path derived from a route parameter; the tests that
 * matter are the ones proving you cannot write into another academy's athlete,
 * cannot upload something that is not an image, and cannot upload an SVG (which
 * is a script vector, and which Laravel's `image` rule excludes by default).
 */
beforeEach(function (): void {
    Storage::fake('public');
});

it('uploads a photo and returns a populated photo_url', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $response = $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/photo", [
            'photo' => UploadedFile::fake()->image('fabio.png', 512, 512),
        ]);

    $response->assertOk()->assertJsonPath('data.id', $athlete->id);
    expect($response->json('data.photo_url'))->toBeString();

    // Deterministic per athlete, so a replacement overwrites rather than
    // accumulating — same shape as `UploadAvatarAction`.
    expect($athlete->fresh()->photo_path)->toBe("athletes/photos/{$athlete->id}.png");
    Storage::disk('public')->assertExists("athletes/photos/{$athlete->id}.png");
});

it('replaces a previous photo and unlinks the orphan when the format changes', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
        'photo' => UploadedFile::fake()->image('first.png', 256, 256),
    ])->assertOk();

    // `fake()->image()` cannot produce a JPEG here: GD in this PHP image ships
    // with PNG support only, so `imagejpeg` does not exist — which is the same
    // constraint the upload action documents as its reason not to re-encode.
    // A file with an explicit mime is enough, because what is under test is the
    // path derivation, not image decoding.
    $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
        'photo' => UploadedFile::fake()->create('second.jpg', 40, 'image/jpeg'),
    ])->assertOk();

    expect($athlete->fresh()->photo_path)->toBe("athletes/photos/{$athlete->id}.jpg");
    // The old extension is a different path, so without an explicit unlink it
    // would sit on the disk forever with nothing pointing at it.
    Storage::disk('public')->assertMissing("athletes/photos/{$athlete->id}.png");
    Storage::disk('public')->assertExists("athletes/photos/{$athlete->id}.jpg");
});

it('normalises jpeg to jpg so the path does not depend on the browser', function (): void {
    // Safari uploads as `image/jpeg` with extension `jpeg`, Chrome as `jpg`.
    // Two paths for one format would leak an orphan on every replacement.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
        'photo' => UploadedFile::fake()->create('safari.jpeg', 40, 'image/jpeg'),
    ])->assertOk();

    expect($athlete->fresh()->photo_path)->toBe("athletes/photos/{$athlete->id}.jpg");
});

it('stores the original bytes — there is no server-side resize', function (): void {
    // The PHP image ships GD with PNG support only; neither existing uploader
    // re-encodes either. The client frames it with CSS instead.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->image('big.png', 1200, 1200);
    $bytes = file_get_contents($file->getRealPath());

    $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", ['photo' => $file])
        ->assertOk();

    expect(Storage::disk('public')->get("athletes/photos/{$athlete->id}.png"))->toBe($bytes);
});

describe('what it refuses', function (): void {
    it('forbids uploading to an athlete in another academy', function (): void {
        // The path is built from the route parameter, so this is the test that
        // stops one gym writing files into another gym's namespace.
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for(Academy::factory()->create())->create();

        $this->actingAs($user)
            ->postJson("/api/v1/athletes/{$athlete->id}/photo", [
                'photo' => UploadedFile::fake()->image('x.png', 64, 64),
            ])
            ->assertForbidden();

        expect($athlete->fresh()->photo_path)->toBeNull();
        Storage::disk('public')->assertMissing("athletes/photos/{$athlete->id}.png");
    });

    it('forbids deleting the photo of an athlete in another academy', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for(Academy::factory()->create())
            ->create(['photo_path' => 'athletes/photos/999.png']);

        $this->actingAs($user)
            ->deleteJson("/api/v1/athletes/{$athlete->id}/photo")
            ->assertForbidden();

        expect($athlete->fresh()->photo_path)->not->toBeNull();
    });

    it('requires a bearer token', function (): void {
        $athlete = Athlete::factory()->for(Academy::factory()->create())->create();

        $this->postJson("/api/v1/athletes/{$athlete->id}/photo", [
            'photo' => UploadedFile::fake()->image('x.png', 64, 64),
        ])->assertUnauthorized();
    });

    it('rejects a file larger than 2MB', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->postJson("/api/v1/athletes/{$athlete->id}/photo", [
                'photo' => UploadedFile::fake()->create('huge.png', 3000, 'image/png'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('photo');
    });

    it('rejects a file that is not an image', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->postJson("/api/v1/athletes/{$athlete->id}/photo", [
                'photo' => UploadedFile::fake()->create('cert.pdf', 100, 'application/pdf'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('photo');
    });

    it('rejects an SVG, which is a script vector rather than a photo', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->postJson("/api/v1/athletes/{$athlete->id}/photo", [
                'photo' => UploadedFile::fake()->create('x.svg', 10, 'image/svg+xml'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('photo');
    });

    it('rejects a request with no file at all', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->postJson("/api/v1/athletes/{$athlete->id}/photo", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('photo');
    });
});

describe('removing it', function (): void {
    it('deletes the file and clears the path', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
            'photo' => UploadedFile::fake()->image('me.png', 128, 128),
        ])->assertOk();

        $this->actingAs($user)
            ->deleteJson("/api/v1/athletes/{$athlete->id}/photo")
            ->assertOk()
            ->assertJsonPath('data.photo_url', null);

        expect($athlete->fresh()->photo_path)->toBeNull();
        Storage::disk('public')->assertMissing("athletes/photos/{$athlete->id}.png");
    });

    it('is a no-op, not an error, when there is no photo', function (): void {
        // Deleting nothing is the state the caller wanted; a 404 here would
        // just make the client special-case a success.
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->deleteJson("/api/v1/athletes/{$athlete->id}/photo")
            ->assertOk()
            ->assertJsonPath('data.photo_url', null);
    });
});

describe('how it surfaces', function (): void {
    it('is null on an athlete that has never had one', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)
            ->getJson("/api/v1/athletes/{$athlete->id}")
            ->assertOk()
            ->assertJsonPath('data.photo_url', null);
    });

    it('survives a later read of the athlete', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
            'photo' => UploadedFile::fake()->image('me.png', 128, 128),
        ])->assertOk();

        $url = $this->actingAs($user)->getJson("/api/v1/athletes/{$athlete->id}")
            ->assertOk()
            ->json('data.photo_url');

        expect($url)->toBeString()->toContain("athletes/photos/{$athlete->id}.png");
    });

    it('appears on the list, so a face tells the rows apart', function (): void {
        $user = userWithAcademy();
        $athlete = Athlete::factory()->for($user->academy)->create();

        $this->actingAs($user)->postJson("/api/v1/athletes/{$athlete->id}/photo", [
            'photo' => UploadedFile::fake()->image('me.png', 128, 128),
        ])->assertOk();

        $this->actingAs($user)->getJson('/api/v1/athletes')
            ->assertOk()
            ->assertJsonPath('data.0.photo_url', fn (?string $url): bool => is_string($url));
    });
});
