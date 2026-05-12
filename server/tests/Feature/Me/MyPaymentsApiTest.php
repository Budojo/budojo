<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\User;

/**
 * M7 PR-D slice 4 — feature tests for `GET /api/v1/me/payments`.
 *
 * Returns the authenticated athlete's payments for the given
 * calendar year. Defaults to the current year when `?year=` is
 * omitted. Owners and orphan athlete-role users → 404.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function paymentAthlete(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

it("returns the athlete's own payments for the requested year", function (): void {
    [$user, $athlete] = paymentAthlete($this->academy);

    AthletePayment::factory()->for($athlete)->create([
        'year' => 2026,
        'month' => 1,
        'amount_cents' => 5000,
    ]);
    AthletePayment::factory()->for($athlete)->create([
        'year' => 2026,
        'month' => 2,
        'amount_cents' => 5000,
    ]);
    // A different year — must NOT appear in the 2026 response.
    AthletePayment::factory()->for($athlete)->create([
        'year' => 2025,
        'month' => 11,
        'amount_cents' => 5000,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/payments?year=2026')
        ->assertOk();

    $months = collect($response->json('data'))->pluck('month')->all();
    expect($months)->toBe([1, 2]);
});

it('defaults to the current calendar year when year is omitted', function (): void {
    [$user, $athlete] = paymentAthlete($this->academy);
    $currentYear = (int) now()->year;

    AthletePayment::factory()->for($athlete)->create([
        'year' => $currentYear,
        'month' => 3,
        'amount_cents' => 5000,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/payments')
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1)
        ->and($response->json('data.0.year'))->toBe($currentYear)
        ->and($response->json('data.0.month'))->toBe(3);
});

it('isolates payments across athletes (no cross-athlete leak)', function (): void {
    [$user, $athlete] = paymentAthlete($this->academy);
    [, $otherAthlete] = paymentAthlete($this->academy);

    AthletePayment::factory()->for($athlete)->create(['year' => 2026, 'month' => 4]);
    AthletePayment::factory()->for($otherAthlete)->create(['year' => 2026, 'month' => 4]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/payments?year=2026')
        ->assertOk();

    $athleteIds = collect($response->json('data'))->pluck('athlete_id')->unique()->all();
    expect($athleteIds)->toBe([$athlete->id]);
});

it('returns 404 with the canonical envelope for an owner caller', function (): void {
    $this->actingAs($this->owner)
        ->getJson('/api/v1/me/payments')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('returns 404 with the canonical envelope for an athlete-role user without a linked athletes row', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'athlete']);

    $this->actingAs($orphan)
        ->getJson('/api/v1/me/payments')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/payments')->assertStatus(401);
});
