<?php

declare(strict_types=1);

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * #1739 — a renewed medical certificate retires the one it replaces.
 *
 * The rule lives in `Document::scopeNotSuperseded` and is consumed by
 * `GetExpiringDocumentsAction::execute()` (this file) and by the T-30 / T-7 /
 * T-0 owner digest (`SendMedicalCertExpiryRemindersTest`).
 */
function medicalCert(Athlete $athlete, ?string $expiresAt): Document
{
    return Document::factory()->for($athlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => $expiresAt,
    ]);
}

it('drops a medical certificate once a later one replaces it', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $lastYear = medicalCert($athlete, now()->subMonths(2)->toDateString());
    $renewal = medicalCert($athlete, now()->addDays(10)->toDateString());

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->not->toContain($lastYear->id)
        ->and($ids)->toContain($renewal->id);
});

it('keeps the expired certificate visible while it is still the only one', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $lapsed = medicalCert($athlete, now()->subMonths(2)->toDateString());

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$lapsed->id]);
});

it('does not let a trashed certificate supersede the live one it was meant to replace', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $live = medicalCert($athlete, now()->subMonths(2)->toDateString());
    // Uploaded to the wrong athlete, deleted, re-uploaded elsewhere — or
    // simply taken by the 24-month purge. Either way it covers nobody.
    medicalCert($athlete, now()->addYear()->toDateString())->delete();

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$live->id]);
});

it('keeps exactly one row when two certificates share an expiry date', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $sameDay = now()->subMonth()->toDateString();
    $first = medicalCert($athlete, $sameDay);
    $second = medicalCert($athlete, $sameDay);

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    // The tie breaks on id, one way round. Break it symmetrically and BOTH
    // rows supersede each other — the athlete disappears from the list that
    // exists to say they are uncovered.
    expect($ids)->toBe([$second->id])
        ->and($ids)->not->toContain($first->id);
});

it('leaves a dated certificate alone when the athlete also has an undated one', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $expired = medicalCert($athlete, now()->subMonth()->toDateString());
    medicalCert($athlete, null);

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    // An undated row says nothing about when coverage ends, so it is no
    // evidence that coverage was renewed.
    expect($ids)->toBe([$expired->id]);
});

it('never supersedes an id card, an insurance paper or an other', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $older = collect([DocumentType::IdCard, DocumentType::Insurance, DocumentType::Other])
        ->map(function (DocumentType $type) use ($athlete): int {
            Document::factory()->for($athlete)->create([
                'type' => $type,
                'expires_at' => now()->addDays(20)->toDateString(),
            ]);

            return Document::factory()->for($athlete)->create([
                'type' => $type,
                'expires_at' => now()->subMonth()->toDateString(),
            ])->id;
        })->all();

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    // Six rows, none retired: only a medical certificate has a renewal cycle
    // the product models. Two ID cards are two documents, not a replacement.
    expect($ids)->toHaveCount(6)
        ->and($ids)->toContain(...$older);
});

it('does not let one athlete\'s renewal retire another athlete\'s certificate', function (): void {
    $user = userWithAcademy();
    $renewed = Athlete::factory()->for($user->academy)->create();
    $neglected = Athlete::factory()->for($user->academy)->create();

    medicalCert($renewed, now()->addYear()->toDateString());
    $stale = medicalCert($neglected, now()->subMonth()->toDateString());

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$stale->id]);
});

it('still counts an athlete whose every certificate is trashed as missing one', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    medicalCert($athlete, now()->subMonth()->toDateString())->delete();
    medicalCert($athlete, now()->addYear()->toDateString())->delete();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();

    // Supersession decides which live row is current; it must not turn an
    // athlete with no live certificate at all into an athlete with nothing
    // to chase.
    expect($response->json('data'))->toBe([])
        ->and(collect($response->json('missing_medical_certificate'))->pluck('id'))
        ->toContain($athlete->id);
});
