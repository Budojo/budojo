<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('returns documents expiring in the next N days (default 30)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $expiringSoon = Document::factory()->for($athlete)->expiringIn(10)->create();
    $expiringLater = Document::factory()->for($athlete)->expiringIn(45)->create();
    $valid = Document::factory()->for($athlete)->valid()->create();

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
    $expired = Document::factory()->for($athlete)->expired()->create();
    $expiringSoon = Document::factory()->for($athlete)->expiringIn(5)->create();

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
    $expiringIn20 = Document::factory()->for($athlete)->expiringIn(20)->create();
    $expired = Document::factory()->for($athlete)->expired()->create();
    $expiringIn5 = Document::factory()->for($athlete)->expiringIn(5)->create();

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
    Document::factory()->for($athlete)->expiringIn(10)->create();
    Document::factory()->for($athlete)->expiringIn(20)->create();
    Document::factory()->for($athlete)->expiringIn(60)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring?days=15')
        ->assertOk()
        ->assertJsonCount(1, 'data');
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
    Document::factory()->for($athlete)->expiringIn(5)->create();

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
    Document::factory()->for($athlete)->expiringIn(5)->create(['deleted_at' => now()]);

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

it('excludes inactive / suspended athletes from missing_medical_certificate', function (): void {
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create(['status' => 'suspended']);
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
