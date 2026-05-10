<?php

declare(strict_types=1);

use App\Actions\Document\UploadDocumentAction;
use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Support\DocumentEncryption;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    Storage::fake('local');
});

it('encrypts medical certificate bytes at-rest — no plaintext on disk', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    $plaintext = "%PDF-1.4\n%PEST FIXTURE BYTES — SENSITIVE\n%%EOF";
    $upload = UploadedFile::fake()->createWithContent('cert.pdf', $plaintext);

    $action = new UploadDocumentAction();
    $document = $action->execute(
        athlete: $athlete,
        type: DocumentType::MedicalCertificate,
        file: $upload,
    );

    expect($document->is_encrypted)->toBeTrue();

    // The bytes on disk MUST NOT contain the plaintext fixture.
    $stored = Storage::disk('local')->get($document->file_path);
    expect($stored)->not->toBe($plaintext);
    expect($stored)->not->toContain('SENSITIVE');
    // Wire format starts with the version byte 0x01.
    expect(ord($stored[0]))->toBe(DocumentEncryption::VERSION);
});

it('downloads a medical certificate as the original plaintext', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    $plaintext = "%PDF-1.4\nIDONEITÀ SPORTIVA — round-trip\n%%EOF";
    $upload = UploadedFile::fake()->createWithContent('cert.pdf', $plaintext);
    $action = new UploadDocumentAction();
    $document = $action->execute(
        athlete: $athlete,
        type: DocumentType::MedicalCertificate,
        file: $upload,
    );

    $response = $this->actingAs($owner)->get("/api/v1/documents/{$document->id}/download");
    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toBe($document->mime_type);
    expect($response->getContent())->toBe($plaintext);
});

it('non-medical documents stay plaintext (is_encrypted = false)', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    // Pick any non-medical case.
    $nonMedical = collect(DocumentType::cases())
        ->first(fn (DocumentType $t): bool => $t !== DocumentType::MedicalCertificate);

    if ($nonMedical === null) {
        $this->markTestSkipped('Only the medical_certificate case exists today; nothing else to assert plaintext for.');
    }

    $plaintext = 'federation registration paperwork — non-sensitive';
    $upload = UploadedFile::fake()->createWithContent('reg.pdf', $plaintext);
    $action = new UploadDocumentAction();
    $document = $action->execute(athlete: $athlete, type: $nonMedical, file: $upload);

    expect($document->is_encrypted)->toBeFalse();
    expect(Storage::disk('local')->get($document->file_path))->toBe($plaintext);
});

it('legacy plaintext rows (is_encrypted = false) still download correctly', function (): void {
    // Simulates a pre-#224 row: write a plaintext file directly, mark
    // is_encrypted=false, confirm the download path serves it as-is
    // without trying to decrypt.
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    $plaintext = 'legacy plain file content';
    $path = 'documents/legacy-cert.pdf';
    Storage::disk('local')->put($path, $plaintext);

    $document = $athlete->documents()->create([
        'type' => DocumentType::MedicalCertificate->value,
        'file_path' => $path,
        'original_name' => 'legacy.pdf',
        'mime_type' => 'application/pdf',
        'size_bytes' => strlen($plaintext),
        'is_encrypted' => false,
    ]);

    $response = $this->actingAs($owner)
        ->get("/api/v1/documents/{$document->id}/download");
    $response->assertOk();
    expect($response->getContent() ?: $response->streamedContent())->toBe($plaintext);
});

it('encrypted blob round-trips through DocumentEncryption losslessly', function (): void {
    $payload = random_bytes(1024) . "\x00\xff random binary + nulls";
    $enc = new DocumentEncryption();
    $blob = $enc->encrypt($payload);
    expect($enc->decrypt($blob))->toBe($payload);
});

it('decrypt rejects a tampered blob (GCM tag mismatch)', function (): void {
    $enc = new DocumentEncryption();
    $blob = $enc->encrypt('original');
    // Flip the last byte of the ciphertext.
    $tampered = substr($blob, 0, -1) . chr(ord($blob[-1]) ^ 0xff);
    expect(fn () => $enc->decrypt($tampered))->toThrow(\RuntimeException::class);
});

it('decrypt rejects an unknown version byte', function (): void {
    $enc = new DocumentEncryption();
    $blob = $enc->encrypt('x');
    $tampered = chr(0x99) . substr($blob, 1);
    expect(fn () => $enc->decrypt($tampered))->toThrow(\RuntimeException::class);
});
