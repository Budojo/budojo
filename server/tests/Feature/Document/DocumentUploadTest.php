<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

// userWithAcademy() helper lives in tests/Pest.php

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Storage::fake('local');
});

// ─── Happy paths ──────────────────────────────────────────────────────────────

it('uploads a pdf document with full metadata', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('medical_2026.pdf', 2048, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'medical_certificate',
            'file' => $file,
            'issued_at' => '2026-01-15',
            'expires_at' => '2027-01-15',
            'notes' => 'Dr. Rossi clinic',
        ])
        ->assertCreated()
        ->assertJsonPath('data.type', 'medical_certificate')
        ->assertJsonPath('data.original_name', 'medical_2026.pdf')
        ->assertJsonPath('data.mime_type', 'application/pdf')
        ->assertJsonPath('data.issued_at', '2026-01-15')
        ->assertJsonPath('data.expires_at', '2027-01-15');

    $document = Document::query()->firstOrFail();

    expect($document->athlete_id)->toBe($athlete->id);
    expect($document->size_bytes)->toBeGreaterThan(0);
    Storage::disk('local')->assertExists($document->file_path);
});

it('uploads a png image document', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    // Using png because the test container's GD build lacks imagejpeg().
    // Both pdf, jpeg and png are accepted — happy path for image MIMEs is covered.
    $file = UploadedFile::fake()->image('id_front.png', 800, 600);

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'id_card',
            'file' => $file,
        ])
        ->assertCreated()
        ->assertJsonPath('data.mime_type', 'image/png');
});

it('accepts an upload without issue/expiry dates', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('other.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'other',
            'file' => $file,
        ])
        ->assertCreated()
        ->assertJsonPath('data.issued_at', null)
        ->assertJsonPath('data.expires_at', null);
});

// ─── Validation ───────────────────────────────────────────────────────────────

it('returns 422 when the file is missing', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'medical_certificate',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);
});

it('returns 422 when the type is invalid', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('x.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'passport',
            'file' => $file,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['type']);
});

it('returns 422 when the file exceeds 10 MB', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('huge.pdf', 11_000, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'other',
            'file' => $file,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);

    expect(Document::query()->count())->toBe(0);
});

it('returns 422 when the file mime type is not accepted', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('virus.exe', 100, 'application/x-msdownload');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'other',
            'file' => $file,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);
});

it('returns 422 when expires_at is before issued_at', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'medical_certificate',
            'file' => $file,
            'issued_at' => '2026-06-01',
            'expires_at' => '2026-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['expires_at']);
});

// ─── Authorization ────────────────────────────────────────────────────────────

it('returns 401 on upload without auth', function (): void {
    $athlete = Athlete::factory()->create();

    $this->postJson("/api/v1/athletes/{$athlete->id}/documents", [])
        ->assertUnauthorized();
});

it('returns 403 when uploading to an athlete in another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();
    $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'medical_certificate',
            'file' => $file,
        ])
        ->assertForbidden();

    expect(Document::query()->count())->toBe(0);
    Storage::disk('local')->assertDirectoryEmpty('documents');
});
