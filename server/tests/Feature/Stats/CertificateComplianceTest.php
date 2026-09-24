<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;

// helpers live in tests/Pest.php

/**
 * How many of the academy's active athletes are covered by a medical
 * certificate (#1732) — athletes, not rows. The figure an insurer or CONI asks
 * an Italian owner for, which a count of expiring paper cannot answer.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-24 10:00:00');
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

function certificate(Athlete $athlete, ?string $expiresAt, bool $trashed = false): Document
{
    return Document::factory()->for($athlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => $expiresAt,
        'deleted_at' => $trashed ? now() : null,
    ]);
}

function compliance(object $test): array
{
    /** @var array<string, int|null> */
    return $test->actingAs($test->user)
        ->getJson('/api/v1/stats/documents/compliance')
        ->assertOk()
        ->json('data');
}

it('counts athletes by their current certificate, and says what share is covered', function (): void {
    certificate(Athlete::factory()->for($this->academy)->create(), '2027-03-01');
    certificate(Athlete::factory()->for($this->academy)->create(), '2026-10-10');
    certificate(Athlete::factory()->for($this->academy)->create(), '2026-05-01');
    Athlete::factory()->for($this->academy)->create();

    // Expiring counts as covered: a certificate that lapses in three weeks is
    // valid today, which is also what the amber badge says.
    expect(compliance($this))->toBe([
        'total_active' => 4,
        'valid' => 1,
        'expiring' => 1,
        'expired' => 1,
        'missing' => 1,
        'compliance_pct' => 50,
    ]);
});

it('counts an athlete once, by the certificate with the latest expiry', function (): void {
    // The point of the whole figure. Two live rows — one lapsed in 2024, one
    // good until next year — are one athlete who is covered, not one covered
    // and one expired.
    $renewed = Athlete::factory()->for($this->academy)->create();
    certificate($renewed, '2024-05-01');
    certificate($renewed, '2027-05-01');

    expect(compliance($this))
        ->toMatchArray(['total_active' => 1, 'valid' => 1, 'expired' => 0, 'compliance_pct' => 100]);
});

it('reads an undated certificate and a deleted one as no certificate', function (): void {
    // Red "missing" on the athlete's own tab, and until now invisible on every
    // academy-wide figure.
    certificate(Athlete::factory()->for($this->academy)->create(), null);
    certificate(Athlete::factory()->for($this->academy)->create(), '2027-03-01', trashed: true);

    expect(compliance($this))->toMatchArray(['total_active' => 2, 'missing' => 2, 'valid' => 0]);
});

it('counts only active athletes, and only this academy', function (): void {
    Athlete::factory()->for($this->academy)->create(['status' => AthleteStatus::Inactive]);
    certificate(Athlete::factory()->for($this->academy)->create(['status' => AthleteStatus::Inactive]), '2026-01-01');
    certificate(Athlete::factory()->for(userWithAcademy()->academy)->create(), '2026-01-01');
    Athlete::factory()->for($this->academy)->create(['deleted_at' => now()]);
    // A document of the academy's own — the DAE certificate, say — belongs to
    // no athlete and covers none.
    Document::factory()->forAcademy($this->academy)->create([
        'type' => DocumentType::MedicalCertificate, 'expires_at' => '2027-01-01',
    ]);
    certificate($counted = Athlete::factory()->for($this->academy)->create(), '2027-01-01');

    $figures = compliance($this);

    expect($figures['total_active'])->toBe(1)
        ->and($figures['valid'] + $figures['expiring'] + $figures['expired'] + $figures['missing'])->toBe(1);
});

it('reports no percentage for an academy with no active athletes', function (): void {
    // Empty is not compliant and not non-compliant.
    expect(compliance($this))->toBe([
        'total_active' => 0, 'valid' => 0, 'expiring' => 0, 'expired' => 0, 'missing' => 0, 'compliance_pct' => null,
    ]);
});

it('refuses a user with no academy, and a guest', function (): void {
    $this->actingAs(User::factory()->create())
        ->getJson('/api/v1/stats/documents/compliance')
        ->assertForbidden();
    auth()->forgetGuards();
    $this->getJson('/api/v1/stats/documents/compliance')->assertUnauthorized();
});
