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

it('soft-deletes the row and removes the file from disk', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $path = 'documents/todelete.pdf';
    Storage::disk('local')->put($path, 'pdf-content');
    $document = Document::factory()->for($athlete)->create(['file_path' => $path]);

    $this->actingAs($user)
        ->deleteJson("/api/v1/documents/{$document->id}")
        ->assertNoContent();

    // DB: soft-deleted but row still exists
    expect(Document::withTrashed()->find($document->id)?->deleted_at)->not->toBeNull();
    expect(Document::find($document->id))->toBeNull();

    // Disk: file gone
    Storage::disk('local')->assertMissing($path);
});

it('is idempotent when the file is already gone on disk', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create([
        'file_path' => 'documents/ghost.pdf',
    ]);

    // File was never actually written — Storage::fake() starts empty
    $this->actingAs($user)
        ->deleteJson("/api/v1/documents/{$document->id}")
        ->assertNoContent();

    expect(Document::withTrashed()->find($document->id)?->deleted_at)->not->toBeNull();
});

it('returns 403 when deleting a document in another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();
    $path = 'documents/other.pdf';
    Storage::disk('local')->put($path, 'content');
    $document = Document::factory()->for($athlete)->create(['file_path' => $path]);

    $this->actingAs($user)
        ->deleteJson("/api/v1/documents/{$document->id}")
        ->assertForbidden();

    // File must NOT be deleted
    Storage::disk('local')->assertExists($path);
});

it('returns 401 on delete without auth', function (): void {
    $document = Document::factory()->create();

    $this->deleteJson("/api/v1/documents/{$document->id}")->assertUnauthorized();
});
