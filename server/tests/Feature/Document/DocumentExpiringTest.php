<?php

declare(strict_types=1);

use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * These cover the expiry WINDOW — which dates land in the list, in what
 * order. They pin `type` to an ID card on purpose: `DocumentFactory` rolls a
 * random `DocumentType`, and since #1739 a medical certificate can be
 * superseded by a later one on the same athlete. Left to the roll, a test
 * that puts three documents on one athlete would pass or fail depending on
 * how many came back `medical_certificate`. Renewal has its own file —
 * `MedicalCertificateSupersessionTest`.
 */
function idCard(Athlete $athlete): \Database\Factories\DocumentFactory
{
    return Document::factory()->for($athlete)->state(['type' => DocumentType::IdCard]);
}

it('returns documents expiring in the next N days (default 30)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $expiringSoon = idCard($athlete)->expiringIn(10)->create();
    $expiringLater = idCard($athlete)->expiringIn(45)->create();
    $valid = idCard($athlete)->valid()->create();

    $response = $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toContain($expiringSoon->id);
    expect($ids)->not->toContain($expiringLater->id);
    expect($ids)->not->toContain($valid->id);
});

it('includes already-expired documents in the response', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $expired = idCard($athlete)->expired()->create();
    $expiringSoon = idCard($athlete)->expiringIn(5)->create();

    $response = $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toContain($expired->id);
    expect($ids)->toContain($expiringSoon->id);
});

it('orders results by expires_at ascending (most urgent first)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $expiringIn20 = idCard($athlete)->expiringIn(20)->create();
    $expired = idCard($athlete)->expired()->create();
    $expiringIn5 = idCard($athlete)->expiringIn(5)->create();

    $response = $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    // expired first, then in 5 days, then in 20 days
    expect($ids)->toBe([$expired->id, $expiringIn5->id, $expiringIn20->id]);
});

it('respects the days query parameter', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    idCard($athlete)->expiringIn(10)->create();
    idCard($athlete)->expiringIn(20)->create();
    idCard($athlete)->expiringIn(60)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring?days=15')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('includes a document expiring on exactly the last day of the window', function (): void {
    // The `date` cast writes `2026-10-15 00:00:00`; the cutoff is the bare
    // `2026-10-15`. Compared as text the stored value sorts after it, so the
    // boundary day fell off the list while the T-30 digest — which uses
    // `whereDate` — emailed about it the same morning.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $onTheDay = idCard($athlete)->expiringIn(30)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring?days=30')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $onTheDay->id);
});

it('still excludes the day after the window closes', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    idCard($athlete)->expiringIn(31)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring?days=30')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('does not include documents with null expires_at', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()->for($athlete)->create(['expires_at' => null]);

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('only returns documents from the authenticated academy', function (): void {
    $user = userWithAcademy();
    $myAthlete = Athlete::factory()->for($user->academy)->create();
    $otherAcademy = Academy::factory()->create();
    $otherAthlete = Athlete::factory()->for($otherAcademy)->create();

    Document::factory()->for($myAthlete)->expiringIn(5)->create();
    Document::factory()->for($otherAthlete)->expiringIn(5)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('each entry carries athlete id and name for deep-link', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);
    idCard($athlete)->expiringIn(5)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonPath('data.0.athlete.id', $athlete->id)
        ->assertJsonPath('data.0.athlete.first_name', 'Mario')
        ->assertJsonPath('data.0.athlete.last_name', 'Rossi');
});

it('excludes soft-deleted documents', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    idCard($athlete)->expiringIn(5)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

// Active athletes only (#1740) — the same definition `missingMedicalCertificate`
// below has always used. An inactive athlete is not asked for a certificate,
// so their lapsed paperwork is not an alarm.

it('excludes documents belonging to an inactive athlete', function (): void {
    $user = userWithAcademy();
    $left = Athlete::factory()->for($user->academy)->create(['status' => 'inactive']);
    $training = Athlete::factory()->for($user->academy)->create(['status' => 'active']);
    idCard($left)->expired()->create();
    $chase = idCard($training)->expired()->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();

    expect(collect($response->json('data'))->pluck('id')->all())->toBe([$chase->id]);
});

it('excludes an inactive athlete\'s medical certificate from the expiring list too', function (): void {
    $user = userWithAcademy();
    $left = Athlete::factory()->for($user->academy)->create(['status' => 'inactive']);
    Document::factory()->for($left)->state(['type' => DocumentType::MedicalCertificate])->expiringIn(5)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('returns 401 on expiring endpoint without auth', function (): void {
    $this->getJson('/api/v1/documents/expiring')->assertUnauthorized();
});

// Missing-medical-certificate split — same CONI/insurance risk as an
// expired one, must surface in the dashboard widget (#881).

it('includes active athletes with no medical certificate in the missing_medical_certificate array', function (): void {
    $user = userWithAcademy();
    $withCert = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario', 'last_name' => 'Rossi']);
    Document::factory()->for($withCert)->state(['type' => \App\Enums\DocumentType::MedicalCertificate])->valid()->create();
    $missing = Athlete::factory()->for($user->academy)->create(['first_name' => 'Luca', 'last_name' => 'Bianchi']);

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();
    $ids = collect($response->json('missing_medical_certificate'))->pluck('id')->all();

    expect($ids)->toContain($missing->id)->and($ids)->not->toContain($withCert->id);
});

it('excludes inactive athletes from missing_medical_certificate', function (): void {
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create(['status' => 'inactive']);
    $active = Athlete::factory()->for($user->academy)->create(['status' => 'active']);

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();
    $ids = collect($response->json('missing_medical_certificate'))->pluck('id')->all();

    expect($ids)->toEqual([$active->id]);
});

it('counts an athlete as missing when the only medical certificate row is soft-deleted', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()
        ->for($athlete)
        ->state(['type' => \App\Enums\DocumentType::MedicalCertificate, 'deleted_at' => now()])
        ->valid()
        ->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();
    expect(collect($response->json('missing_medical_certificate'))->pluck('id'))->toContain($athlete->id);
});

it('does NOT count an athlete with an EXPIRED medical certificate as missing (they show in data already)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()
        ->for($athlete)
        ->state(['type' => \App\Enums\DocumentType::MedicalCertificate])
        ->expired()
        ->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();
    expect(collect($response->json('missing_medical_certificate'))->pluck('id'))->not->toContain($athlete->id);
});

it('inlines the athlete\'s identity on an expiring document and a missing certificate (#1851)', function (): void {
    $user = userWithAcademy();
    $withDoc = Athlete::factory()->for($user->academy)->create([
        'belt' => \App\Enums\Belt::Brown->value,
        'stripes' => 1,
        'date_of_birth' => '1985-07-02',
    ]);
    // An ID card, not a certificate: so this athlete is also missing one.
    idCard($withDoc)->expiringIn(5)->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();

    expect($response->json('data.0.athlete'))->toMatchArray([
        'id' => $withDoc->id,
        'belt' => 'brown',
        'stripes' => 1,
        'date_of_birth' => '1985-07-02',
        'photo_url' => null,
    ]);
    $missing = collect($response->json('missing_medical_certificate'))->firstWhere('id', $withDoc->id);
    expect($missing)->toMatchArray([
        'first_name' => $withDoc->first_name,
        'last_name' => $withDoc->last_name,
        'belt' => 'brown',
        'stripes' => 1,
        'date_of_birth' => '1985-07-02',
    ]);
});

it('ignores non-medical document types when computing missing_medical_certificate', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()
        ->for($athlete)
        ->state(['type' => \App\Enums\DocumentType::IdCard])
        ->valid()
        ->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();
    expect(collect($response->json('missing_medical_certificate'))->pluck('id'))->toContain($athlete->id);
});
