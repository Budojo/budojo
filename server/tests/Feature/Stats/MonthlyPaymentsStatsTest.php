<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

it('returns monthly revenue bucketed by business (year, month)', function (): void {
    $user = userWithAcademy();
    $athleteA = Athlete::factory()->for($user->academy)->create();
    $athleteB = Athlete::factory()->for($user->academy)->create();

    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 5, 15));

    // April 2026: two payments across two athletes, totalling 12 000 cents.
    AthletePayment::factory()->for($athleteA)->state([
        'year' => 2026, 'month' => 4, 'amount_cents' => 5000,
    ])->create();
    AthletePayment::factory()->for($athleteB)->state([
        'year' => 2026, 'month' => 4, 'amount_cents' => 7000,
    ])->create();

    // May 2026: one payment, 9 500 cents.
    AthletePayment::factory()->for($athleteA)->state([
        'year' => 2026, 'month' => 5, 'amount_cents' => 9500,
    ])->create();

    // 2025-04: outside the 12-month window (window starts 2025-06).
    AthletePayment::factory()->for($athleteA)->state([
        'year' => 2025, 'month' => 4, 'amount_cents' => 4000,
    ])->create();

    Sanctum::actingAs($user);
    $data = $this->getJson('/api/v1/stats/payments/monthly')->assertOk()->json('data');

    expect($data)->toHaveCount(12);

    $april = collect($data)->firstWhere('month', '2026-04');
    expect($april['amount_cents'])->toBe(12000);
    expect($april['currency'])->toBe('EUR');

    $may = collect($data)->firstWhere('month', '2026-05');
    expect($may['amount_cents'])->toBe(9500);

    $totalAcrossWindow = collect($data)->sum('amount_cents');
    expect($totalAcrossWindow)->toBe(21500); // 2025-04 row excluded
});

it('returns zero-amount rows for months without payments', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $data = $this->getJson('/api/v1/stats/payments/monthly')->assertOk()->json('data');

    expect($data)->toHaveCount(12);
    foreach ($data as $row) {
        expect($row['amount_cents'])->toBe(0);
        expect($row['currency'])->toBe('EUR');
    }
});

it('isolates academies on payments aggregation', function (): void {
    $userA = userWithAcademy();
    $userB = userWithAcademy();
    $bobInB = Athlete::factory()->for($userB->academy)->create();
    AthletePayment::factory()->for($bobInB)->state([
        'year' => (int) CarbonImmutable::now()->format('Y'),
        'month' => (int) CarbonImmutable::now()->format('m'),
        'amount_cents' => 50000,
    ])->create();

    Sanctum::actingAs($userA);
    $data = $this->getJson('/api/v1/stats/payments/monthly')->assertOk()->json('data');

    expect(collect($data)->sum('amount_cents'))->toBe(0);
});

it('rejects months outside [1, 24]', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson('/api/v1/stats/payments/monthly?months=0')->assertUnprocessable();
    $this->getJson('/api/v1/stats/payments/monthly?months=25')->assertUnprocessable();
});

it('rejects unauthenticated callers on payments endpoint', function (): void {
    $this->getJson('/api/v1/stats/payments/monthly')->assertUnauthorized();
});
