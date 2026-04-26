<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update(['monthly_fee_cents' => 9500]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

// ─── POST /athletes/{id}/payments ─────────────────────────────────────────────

it('records a payment and returns 201 with the persisted row', function (): void {
    $response = $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026,
            'month' => 4,
        ])
        ->assertCreated()
        ->assertJsonStructure([
            'data' => ['id', 'athlete_id', 'year', 'month', 'amount_cents', 'paid_at'],
        ])
        ->assertJsonPath('data.year', 2026)
        ->assertJsonPath('data.month', 4)
        // Snapshotted from the academy's fee at the moment of payment.
        ->assertJsonPath('data.amount_cents', 9500);

    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('is idempotent — POSTing the same {year, month} twice does not create a duplicate row', function (): void {
    $body = ['year' => 2026, 'month' => 4];

    $first = $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", $body)
        ->assertCreated()
        ->json('data.id');

    $second = $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", $body)
        ->assertCreated()
        ->json('data.id');

    expect($second)->toBe($first);
    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('returns 422 when the academy has no monthly fee configured', function (): void {
    $this->user->academy->update(['monthly_fee_cents' => null]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 4,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['monthly_fee_cents']);
});

it('returns 422 when month is out of range', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 13,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['month']);
});

it('returns 403 when targeting an athlete from a different academy', function (): void {
    $other = userWithAcademy();
    $other->academy->update(['monthly_fee_cents' => 9500]);
    $foreignAthlete = Athlete::factory()->for($other->academy)->create();

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$foreignAthlete->id}/payments", [
            'year' => 2026, 'month' => 4,
        ])
        ->assertForbidden();

    expect(AthletePayment::count())->toBe(0);
});

it('returns 401 unauthenticated', function (): void {
    $this->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
        'year' => 2026, 'month' => 4,
    ])->assertUnauthorized();
});

// ─── GET /athletes/{id}/payments ──────────────────────────────────────────────

it('lists payments for the requested year, ordered by month asc', function (): void {
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 3)->create();
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 1)->create();
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 7)->create();
    // Different year — must NOT show up.
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2025, 12)->create();

    $months = collect($this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/payments?year=2026")
        ->assertOk()
        ->json('data'))
        ->pluck('month')
        ->all();

    expect($months)->toBe([1, 3, 7]);
});

it('defaults to the current year when no year query param is supplied', function (): void {
    $currentYear = (int) now()->year;
    AthletePayment::factory()->for($this->athlete)->forYearMonth($currentYear, 5)->create();
    AthletePayment::factory()->for($this->athlete)->forYearMonth($currentYear - 1, 5)->create();

    $rows = $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/payments")
        ->assertOk()
        ->json('data');

    expect(count($rows))->toBe(1);
    expect($rows[0]['year'])->toBe($currentYear);
});

it('returns 403 when listing payments for an athlete from a different academy', function (): void {
    $other = userWithAcademy();
    $foreignAthlete = Athlete::factory()->for($other->academy)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$foreignAthlete->id}/payments")
        ->assertForbidden();
});

// ─── DELETE /athletes/{id}/payments/{year}/{month} ────────────────────────────

it('removes a payment via DELETE returning 204', function (): void {
    $payment = AthletePayment::factory()->for($this->athlete)->forYearMonth(2026, 4)->create();

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/4")
        ->assertNoContent();

    expect(AthletePayment::find($payment->id))->toBeNull();
});

it('returns 404 when DELETE targets a (year, month) with no payment', function (): void {
    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/4")
        ->assertNotFound();
});

it('returns 403 when DELETE targets an athlete from a different academy', function (): void {
    $other = userWithAcademy();
    $foreignAthlete = Athlete::factory()->for($other->academy)->create();
    AthletePayment::factory()->for($foreignAthlete)->forYearMonth(2026, 4)->create();

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$foreignAthlete->id}/payments/2026/4")
        ->assertForbidden();
});

// ─── Athlete resource — paid_current_month derivation ─────────────────────────

it('exposes paid_current_month=false when no payment exists for the current month', function (): void {
    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.paid_current_month', false);
});

it('exposes paid_current_month=true after the athlete is marked paid for the current month', function (): void {
    AthletePayment::factory()->for($this->athlete)->forCurrentMonth()->create();

    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.paid_current_month', true);
});

it('does not flip paid_current_month when only a previous month is paid', function (): void {
    // Pick a month/year guaranteed to be in the past.
    AthletePayment::factory()->for($this->athlete)->forYearMonth(2020, 1)->create();

    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.paid_current_month', false);
});
