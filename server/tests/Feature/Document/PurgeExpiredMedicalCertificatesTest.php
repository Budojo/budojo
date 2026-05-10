<?php

declare(strict_types=1);

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    // The DeleteDocumentAction hits the `local` disk on its way out
    // — point it at a fake so PEST never touches the host filesystem.
    Storage::fake('local');
});

it('purges medical certificates whose expires_at is older than 24 months', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    // Cert #1: expired 25 months ago → SHOULD be purged.
    $old = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => now()->subMonths(25)->toDateString(),
    ]);

    // Cert #2: expired 12 months ago → still within the 24-month
    // retention window, should remain.
    $recentlyExpired = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => now()->subMonths(12)->toDateString(),
    ]);

    // Cert #3: still valid (expires in the future) → MUST remain.
    $stillValid = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => now()->addMonths(3)->toDateString(),
    ]);

    $exitCode = \Artisan::call('budojo:purge-expired-medical-certificates');

    expect($exitCode)->toBe(0);
    expect(Document::query()->where('id', $old->id)->exists())->toBeFalse();
    expect(Document::query()->where('id', $recentlyExpired->id)->exists())->toBeTrue();
    expect(Document::query()->where('id', $stillValid->id)->exists())->toBeTrue();
});

it('does not touch non-medical documents even when they are well-aged', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    // A federation registration, expired 5 years ago — still
    // outside this cron's scope. Other DocumentType cases have
    // their own retention rules that haven't been decided yet.
    $nonMedicalType = collect(DocumentType::cases())
        ->first(fn (DocumentType $t): bool => $t !== DocumentType::MedicalCertificate);

    if ($nonMedicalType === null) {
        // Only one DocumentType case today — the assertion below
        // becomes vacuous. Skip explicitly so a future contributor
        // sees what to do when a second case lands.
        $this->markTestSkipped('Only the medical_certificate case exists today; no second DocumentType to assert against.');
    }

    $oldFederationDoc = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => $nonMedicalType->value,
        'expires_at' => now()->subYears(5)->toDateString(),
    ]);

    \Artisan::call('budojo:purge-expired-medical-certificates');

    expect(Document::query()->where('id', $oldFederationDoc->id)->exists())->toBeTrue();
});

it('--dry-run reports the candidate count without deleting', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    $doc = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => now()->subMonths(30)->toDateString(),
    ]);

    $exitCode = \Artisan::call('budojo:purge-expired-medical-certificates', ['--dry-run' => true]);

    expect($exitCode)->toBe(0);
    expect(Document::query()->where('id', $doc->id)->exists())->toBeTrue();
});

it('returns SUCCESS exit code when no expired certificates exist', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    // One valid cert in the inbox.
    Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => now()->addMonths(2)->toDateString(),
    ]);

    $exitCode = \Artisan::call('budojo:purge-expired-medical-certificates');

    expect($exitCode)->toBe(0);
});

it('skips documents with null expires_at', function (): void {
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->create(['academy_id' => $owner->academy->id]);

    // Some legacy uploads may have NULL expires_at — the cron must
    // NEVER purge those, since there's no signal they're past
    // retention. Only an explicit expiry date in the past triggers
    // the action.
    $doc = Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate->value,
        'expires_at' => null,
    ]);

    \Artisan::call('budojo:purge-expired-medical-certificates');

    expect(Document::query()->where('id', $doc->id)->exists())->toBeTrue();
});
