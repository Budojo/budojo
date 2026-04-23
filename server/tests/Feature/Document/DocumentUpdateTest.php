<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('partially updates document metadata', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create([
        'type' => 'other',
        'notes' => null,
    ]);

    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$document->id}", [
            'type' => 'medical_certificate',
            'notes' => 'Updated note',
        ])
        ->assertOk()
        ->assertJsonPath('data.type', 'medical_certificate')
        ->assertJsonPath('data.notes', 'Updated note');
});

it('does not change file_path on update (file cannot be replaced via PUT)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create(['file_path' => 'documents/original.pdf']);

    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$document->id}", [
            'file_path' => 'documents/injected.pdf',
            'type' => 'medical_certificate',
        ])
        ->assertOk();

    expect($document->fresh()->file_path)->toBe('documents/original.pdf');
});

it('returns 422 when type is invalid on update', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create();

    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$document->id}", ['type' => 'passport'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['type']);
});

it('returns 422 when expires_at is before issued_at on update', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $document = Document::factory()->for($athlete)->create();

    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$document->id}", [
            'issued_at' => '2026-06-01',
            'expires_at' => '2026-01-01',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['expires_at']);
});

it('returns 403 with "Forbidden." body when updating a document in another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();
    $document = Document::factory()->for($athlete)->create();

    // Asserts the exact body, not just the status. UpdateDocumentRequest's
    // failedAuthorization() override guarantees this matches what
    // DocumentController::download / destroy emit via userOwns().
    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$document->id}", ['type' => 'insurance'])
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('returns 401 on update without auth', function (): void {
    $document = Document::factory()->create();

    $this->putJson("/api/v1/documents/{$document->id}", [])->assertUnauthorized();
});
