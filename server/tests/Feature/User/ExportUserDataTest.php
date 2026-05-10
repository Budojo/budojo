<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Document;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('returns the full account dataset as JSON for /me/export', function (): void {
    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()
        ->for($user->academy)
        ->create(['first_name' => 'Mario', 'last_name' => 'Rossi', 'belt' => Belt::Blue]);

    AthletePayment::factory()
        ->for($athlete)
        ->create(['year' => 2026, 'month' => 4, 'amount_cents' => 5000]);

    AttendanceRecord::factory()
        ->for($athlete)
        ->create(['attended_on' => '2026-04-15']);

    $response = $this->actingAs($user)->getJson('/api/v1/me/export');

    $response->assertOk()
        ->assertJsonPath('version', '1.0')
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', $user->email)
        ->assertJsonPath('data.academy.id', $user->academy->id)
        ->assertJsonPath('data.athletes.0.first_name', 'Mario')
        ->assertJsonPath('data.athletes.0.belt', 'blue')
        ->assertJsonPath('data.athletes.0.payments.0.amount_cents', 5000)
        ->assertJsonPath('data.athletes.0.attendances.0.attended_on', '2026-04-15');

    expect($response->headers->get('Content-Disposition'))
        ->toContain('attachment')
        ->toContain('budojo-export-user-' . $user->id);
});

it('does not leak data from other academies in /me/export', function (): void {
    $userA = userWithAcademy();
    Athlete::factory()->for($userA->academy)->create(['first_name' => 'Alice']);

    $userB = userWithAcademy();
    Athlete::factory()->for($userB->academy)->create(['first_name' => 'Bob']);

    $response = $this->actingAs($userA)->getJson('/api/v1/me/export');

    $response->assertOk()
        ->assertJsonPath('data.athletes.0.first_name', 'Alice')
        ->assertJsonCount(1, 'data.athletes')
        ->assertJsonMissing(['first_name' => 'Bob']);
});

it('returns a ZIP carrying the JSON plus binary documents when format=zip', function (): void {
    Storage::fake('local');

    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario']);

    $upload = UploadedFile::fake()->create('certificato.pdf', 100, 'application/pdf');
    $storedPath = $upload->store('documents', 'local');

    Document::factory()->for($athlete)->create([
        'original_name' => 'certificato.pdf',
        'file_path' => $storedPath,
        'mime_type' => 'application/pdf',
        'size_bytes' => 100,
    ]);

    $response = $this->actingAs($user)->get('/api/v1/me/export?format=zip');

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('application/zip');
    expect($response->headers->get('Content-Disposition'))
        ->toContain('attachment')
        ->toContain('.zip');

    // Verify the returned bytes are a real ZIP carrying both the JSON
    // and the document binary.
    $zipBytes = $response->streamedContent();
    $tmp = tempnam(sys_get_temp_dir(), 'budojo-test-export-') . '.zip';
    file_put_contents($tmp, $zipBytes);

    $zip = new ZipArchive();
    expect($zip->open($tmp))->toBeTrue();

    $jsonRaw = $zip->getFromName('data.json');
    expect($jsonRaw)->toBeString();
    /** @var array<string, mixed> $decoded */
    $decoded = json_decode((string) $jsonRaw, true);
    expect($decoded['data']['athletes'][0]['first_name'])->toBe('Mario');

    $docEntry = sprintf(
        'documents/athlete-%d/%d-certificato.pdf',
        $athlete->id,
        $athlete->documents->first()->id,
    );
    expect($zip->statName($docEntry))->not->toBeFalse();

    $zip->close();
    @unlink($tmp);
});

it('rejects /me/export when the caller is unauthenticated', function (): void {
    $this->getJson('/api/v1/me/export')
        ->assertStatus(401);
});

it('throttles /me/export to 1 request per minute per user', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->getJson('/api/v1/me/export')->assertOk();
    $this->actingAs($user)->getJson('/api/v1/me/export')->assertStatus(429);
});

// ─── Medical-certificate handling — Art. 9 GDPR (#538 / DPIA #227-b) ─────────
//
// Medical certificates are special-category data. The DPIA-lite explicitly
// flags Art. 15 (right of access) and Art. 17 (right to erasure) as risks
// to verify; without these assertions a future refactor of the
// document-export or document-deletion path could silently break GDPR
// compliance and no test would catch it. Each assertion is intentionally
// medical-cert-shaped — generic-document coverage already exists above
// and below this block.

it('export ZIP includes the medical-certificate binary AND the type=medical_certificate metadata (DPIA #538)', function (): void {
    Storage::fake('local');

    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($user->academy)->create(['first_name' => 'Luca']);

    $upload = UploadedFile::fake()->create('cert-medico-luca.pdf', 200, 'application/pdf');
    $storedPath = $upload->store('documents', 'local');

    /** @var Document $doc */
    $doc = Document::factory()->for($athlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'original_name' => 'cert-medico-luca.pdf',
        'file_path' => $storedPath,
        'mime_type' => 'application/pdf',
        'size_bytes' => 200,
    ]);

    $response = $this->actingAs($user)->get('/api/v1/me/export?format=zip');
    $response->assertOk();

    $zipBytes = $response->streamedContent();
    $tmp = tempnam(sys_get_temp_dir(), 'budojo-test-export-medical-') . '.zip';
    file_put_contents($tmp, $zipBytes);

    $zip = new ZipArchive();
    expect($zip->open($tmp))->toBeTrue();

    // (1) JSON metadata carries the medical-certificate type — Art. 15 access
    //     to special-category data requires the user knows what kind of
    //     document each entry is, not just a generic blob.
    $jsonRaw = $zip->getFromName('data.json');
    /** @var array<string, mixed> $decoded */
    $decoded = json_decode((string) $jsonRaw, true);
    /** @var array{type: string, original_name: string} $exportedDoc */
    $exportedDoc = $decoded['data']['athletes'][0]['documents'][0];
    expect($exportedDoc['type'])->toBe(DocumentType::MedicalCertificate->value);
    expect($exportedDoc['original_name'])->toBe('cert-medico-luca.pdf');

    // (2) The ZIP entry path is canonical: documents/athlete-{id}/{doc_id}-{filename}.
    $entryName = sprintf('documents/athlete-%d/%d-cert-medico-luca.pdf', $athlete->id, $doc->id);
    expect($zip->statName($entryName))->not->toBeFalse();

    // (3) The binary inside the ZIP matches what we stored on disk —
    //     not a stub, not a metadata placeholder. Without this the
    //     "right of access" returns the user's data minus the actual
    //     certificate, which is not portability under Art. 20.
    $extracted = $zip->getFromName($entryName);
    $original = Storage::disk('local')->get($storedPath);
    expect($extracted)->toBe($original);

    $zip->close();
    @unlink($tmp);
});

it('export ZIP keeps medical-cert metadata even when the binary is missing on disk (DPIA #538)', function (): void {
    Storage::fake('local');

    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($user->academy)->create();

    // Document row exists but the underlying file was lost (corrupt
    // backup, manual deletion, disk failure during a previous purge).
    // The export must still surface the metadata — silent omission
    // would let a data subject's record disappear without trace.
    Document::factory()->for($athlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'original_name' => 'lost-cert.pdf',
        'file_path' => 'documents/this-file-does-not-exist.pdf',
        'mime_type' => 'application/pdf',
    ]);

    $response = $this->actingAs($user)->get('/api/v1/me/export?format=zip');
    $response->assertOk();

    $zipBytes = $response->streamedContent();
    $tmp = tempnam(sys_get_temp_dir(), 'budojo-test-export-orphan-') . '.zip';
    file_put_contents($tmp, $zipBytes);

    $zip = new ZipArchive();
    expect($zip->open($tmp))->toBeTrue();

    // JSON entry IS present (the row exists in DB) — the controller
    // must NOT skip the metadata just because the binary is missing.
    $jsonRaw = $zip->getFromName('data.json');
    /** @var array<string, mixed> $decoded */
    $decoded = json_decode((string) $jsonRaw, true);
    expect($decoded['data']['athletes'][0]['documents'])
        ->toHaveCount(1)
        ->and($decoded['data']['athletes'][0]['documents'][0]['type'])
        ->toBe(DocumentType::MedicalCertificate->value);

    $zip->close();
    @unlink($tmp);
});
