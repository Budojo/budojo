<?php

declare(strict_types=1);

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * #1931 — Stato documenti is a list of people to chase, and on the desktop
 * build WhatsApp is the only way to reach them. The rows carried the
 * identity (#1851) but no phone, so the page could not offer the reminder.
 */
it('carries the phone of the athlete a document belongs to', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
    Document::factory()->for($athlete)->state(['type' => DocumentType::MedicalCertificate])->expiringIn(10)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonPath('data.0.athlete.phone_country_code', '+39')
        ->assertJsonPath('data.0.athlete.phone_national_number', '3331234567');
});

it('carries the phone of an athlete with no medical certificate at all', function (): void {
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => '+39',
        'phone_national_number' => '3339876543',
    ]);

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonPath('missing_medical_certificate.0.phone_country_code', '+39')
        ->assertJsonPath('missing_medical_certificate.0.phone_national_number', '3339876543');
});

it('says null, not absent, for an athlete with no phone on file', function (): void {
    // The row still renders its (disabled) action: the client reads the pair
    // and says "no number on file", which needs the keys to be there.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => null,
        'phone_national_number' => null,
    ]);
    Document::factory()->for($athlete)->state(['type' => DocumentType::IdCard])->expiringIn(5)->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();

    expect($response->json('data.0.athlete'))->toHaveKey('phone_country_code')
        ->and($response->json('data.0.athlete.phone_country_code'))->toBeNull()
        ->and($response->json('data.0.athlete.phone_national_number'))->toBeNull();
});

it('keeps the phone off an athlete\'s own documents list', function (): void {
    // The number is personal data; it rides only where a reminder is offered.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
    Document::factory()->for($athlete)->state(['type' => DocumentType::IdCard])->valid()->create();

    $response = $this->actingAs($user)->getJson("/api/v1/athletes/{$athlete->id}/documents")->assertOk();

    expect(json_encode($response->json()))->not->toContain('3331234567');
});

it('says which row is the owner\'s own, so they are not offered a reminder to themselves', function (): void {
    // The owner trains and carries a certificate like anyone else (#748), and
    // lands on both lists the same way. The client needs to know the row is
    // theirs to keep the reminder off it.
    $user = userWithAcademy();
    $owner = Athlete::factory()->for($user->academy)->selfFor($user)->create();
    Document::factory()->for($owner)->state(['type' => DocumentType::IdCard])->expiringIn(4)->create();
    $member = Athlete::factory()->for($user->academy)->create();

    $response = $this->actingAs($user)->getJson('/api/v1/documents/expiring')->assertOk();

    expect($response->json('data.0.athlete.is_self'))->toBeTrue();

    /** @var list<array{id: int, is_self: bool}> $missing */
    $missing = $response->json('missing_medical_certificate');
    expect(collect($missing)->pluck('is_self', 'id')->all())->toEqual([
        $owner->id => true,
        $member->id => false,
    ]);
});

it('leaves the academy\'s own papers without an athlete', function (): void {
    $user = userWithAcademy();
    Document::factory()->create([
        'athlete_id' => null,
        'academy_id' => $user->academy->id,
        'type' => DocumentType::Other,
        'expires_at' => now()->addDays(3)->toDateString(),
    ]);

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonPath('data.0.athlete', null);
});
