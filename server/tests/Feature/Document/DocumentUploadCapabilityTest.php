<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Documents are view only on the phone (#2034, PRD § 2): uploading stays on
 * the PC for now. The two upload routes are absent there, 404 like any surface
 * a runtime does not have; everything else about documents works as on the PC.
 */
uses(RefreshDatabase::class);

beforeEach(function (): void {
    Storage::fake('local');
});

it('has no athlete document upload on the phone, and stores nothing', function (): void {
    config()->set('budojo.runtime', 'mobile');
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'id_card',
            'file' => UploadedFile::fake()->create('id.pdf', 100, 'application/pdf'),
        ])
        ->assertNotFound();

    expect(Document::query()->count())->toBe(0);
    expect(Storage::disk('local')->allFiles())->toBe([]);
});

it('has no academy document upload on the phone', function (): void {
    config()->set('budojo.runtime', 'mobile');

    $this->actingAs(userWithAcademy())
        ->postJson('/api/v1/academy/documents', [
            'type' => 'other',
            'file' => UploadedFile::fake()->create('lease.pdf', 100, 'application/pdf'),
        ])
        ->assertNotFound();

    expect(Document::query()->count())->toBe(0);
});

it('still lists, downloads and edits documents on the phone', function (): void {
    config()->set('budojo.runtime', 'mobile');
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create();
    Storage::disk('local')->put($document->file_path, 'a certificate');

    $this->actingAs($user)->getJson("/api/v1/athletes/{$athlete->id}/documents")->assertOk()->assertJsonCount(1, 'data');
    $this->actingAs($user)->get("/api/v1/documents/{$document->id}/download")->assertOk();
    $this->actingAs($user)->putJson("/api/v1/documents/{$document->id}", ['notes' => 'checked'])->assertOk();
});

it('uploads on the desktop', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'id_card',
            'file' => UploadedFile::fake()->create('id.pdf', 100, 'application/pdf'),
        ])
        ->assertCreated();
});
