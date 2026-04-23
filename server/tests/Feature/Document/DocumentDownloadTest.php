<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Storage::fake('local');
});

it('streams a document file with the original filename', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    // Put a fake file on the private disk
    $path = 'documents/test.pdf';
    Storage::disk('local')->put($path, 'pdf-content');
    $document = Document::factory()->for($athlete)->create([
        'file_path' => $path,
        'original_name' => 'medical_2026.pdf',
        'mime_type' => 'application/pdf',
    ]);

    $response = $this->actingAs($user)
        ->get("/api/v1/documents/{$document->id}/download")
        ->assertOk();

    expect($response->headers->get('Content-Type'))->toContain('application/pdf');
    expect($response->headers->get('Content-Disposition'))->toContain('medical_2026.pdf');
    expect($response->streamedContent())->toBe('pdf-content');
});

it('returns 401 on download without auth', function (): void {
    $document = Document::factory()->create();

    // Explicit Accept: application/json so Laravel returns a 401 JSON response
    // instead of the HTML login redirect the auth middleware does by default.
    $this->withHeaders(['Accept' => 'application/json'])
        ->get("/api/v1/documents/{$document->id}/download")
        ->assertUnauthorized();
});

it('returns 403 on download when document belongs to another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();
    $document = Document::factory()->for($athlete)->create();

    $this->actingAs($user)
        ->get("/api/v1/documents/{$document->id}/download")
        ->assertForbidden();
});

it('returns 404 when the document id does not exist', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->get('/api/v1/documents/99999/download')
        ->assertNotFound();
});

it('files on the private disk are not served from the web root', function (): void {
    // P0.10 privacy: a request to /storage/... (the public disk symlink pattern)
    // must not return our private document. This is a negative test: documents
    // on the `local` disk live under storage/app/private and have no web route.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Storage::disk('local')->put('documents/secret.pdf', 'top-secret');
    Document::factory()->for($athlete)->create(['file_path' => 'documents/secret.pdf']);

    // A request to the public storage path MUST NOT serve our private file.
    $response = $this->get('/storage/documents/secret.pdf');
    expect($response->status())->toBeIn([403, 404]);
});

it('returns 404 when the file is missing on disk but the row exists', function (): void {
    // Edge case: if someone nukes the file out-of-band, we do not 500.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create([
        'file_path' => 'documents/nonexistent.pdf',
    ]);

    $this->actingAs($user)
        ->get("/api/v1/documents/{$document->id}/download")
        ->assertNotFound();
});
