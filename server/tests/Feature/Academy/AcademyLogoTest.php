<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    Storage::fake('public');
});

it('uploads an academy logo and returns the url', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png', 256, 256);

    $response = $this->postJson('/api/v1/academy/logo', ['logo' => $file]);

    $response->assertOk()
        ->assertJsonStructure(['data' => ['id', 'name', 'logo_url']])
        ->assertJsonPath('data.id', $academy->id);

    $payload = $response->json('data');
    expect($payload['logo_url'])->toBeString();

    $academy->refresh();
    expect($academy->logo_path)->toBeString();
    Storage::disk('public')->assertExists($academy->logo_path);
});

it('replaces a previous logo and removes the old file', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $first = UploadedFile::fake()->image('first.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $first])->assertOk();
    $firstPath = $academy->refresh()->logo_path;

    $second = UploadedFile::fake()->image('second.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $second])->assertOk();
    $secondPath = $academy->refresh()->logo_path;

    expect($firstPath)->not->toBe($secondPath);
    Storage::disk('public')->assertExists($secondPath);
    Storage::disk('public')->assertMissing($firstPath);
});

it('rejects logo files larger than 2MB', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $tooBig = UploadedFile::fake()->image('huge.png')->size(2049);

    $this->postJson('/api/v1/academy/logo', ['logo' => $tooBig])
        ->assertStatus(422)
        ->assertJsonValidationErrors('logo');
});

it('rejects logo files with disallowed mime types', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $bad = UploadedFile::fake()->create('logo.pdf', 100, 'application/pdf');

    $this->postJson('/api/v1/academy/logo', ['logo' => $bad])
        ->assertStatus(422)
        ->assertJsonValidationErrors('logo');
});

it('forbids upload when the user has no academy', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png');

    $this->postJson('/api/v1/academy/logo', ['logo' => $file])
        ->assertStatus(403);
});

it('removes the logo and clears the path', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $file = UploadedFile::fake()->image('logo.png');
    $this->postJson('/api/v1/academy/logo', ['logo' => $file])->assertOk();
    $path = $academy->refresh()->logo_path;
    expect($path)->toBeString();

    $this->deleteJson('/api/v1/academy/logo')
        ->assertOk()
        ->assertJsonPath('data.logo_url', null);

    expect($academy->refresh()->logo_path)->toBeNull();
    Storage::disk('public')->assertMissing($path);
});

it('returns 404 when deleting a logo without an academy', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->deleteJson('/api/v1/academy/logo')->assertStatus(404);
});

it('exposes logo_url as null when academy has no logo', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.logo_url', null);
});
