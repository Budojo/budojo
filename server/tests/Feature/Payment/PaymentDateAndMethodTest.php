<?php

declare(strict_types=1);

use App\Enums\PaymentMethod;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AuditEntry;
use App\Models\Carnet;

/**
 * When the money actually arrived, and how it was paid (#1761).
 *
 * A fee row knew which months it buys and nothing about the transaction:
 * `paid_at` was always the moment of the click, so September marked on
 * 3 October read as October money, and nothing told the bank from the drawer.
 *
 * The trap this file exists to hold: `paid_at` is the date of the
 * transaction, never the month the revenue belongs to. The chart promises
 * "revenue **for** this month" and buckets by the months a payment covers.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update([
        'monthly_fee_cents' => 9500,
        'carnet_price_cents' => 7000,
        'carnet_entries' => 10,
    ]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
    $this->travelTo('2026-10-10 18:00:00');
});

// ─── The business date ────────────────────────────────────────────────────────

it('stores the day the money arrived, and keeps the revenue in the month it pays for', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 9, 'paid_at' => '2026-10-03',
        ])
        ->assertCreated()
        ->assertJsonPath('data.paid_at', '2026-10-03T00:00:00+00:00');

    expect(AthletePayment::query()->sole()->paid_at->toDateString())->toBe('2026-10-03');

    // Bucketing the chart by `paid_at` would move this into October and
    // silently redefine every historical figure. It must not.
    $buckets = collect($this->actingAs($this->user)
        ->getJson('/api/v1/stats/payments/monthly?months=3')
        ->assertOk()
        ->json('data'))
        ->keyBy('month');

    expect($buckets['2026-09']['amount_cents'])->toBe(9500)
        ->and($buckets['2026-10']['amount_cents'])->toBe(0);
});

it('keeps the first date when the same month is posted twice', function (): void {
    $url = "/api/v1/athletes/{$this->athlete->id}/payments";

    $first = $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 9, 'paid_at' => '2026-10-03'])
        ->assertCreated()
        ->json('data.id');

    // A re-post is the double-click case: the idempotency key is
    // (athlete, year, month), and the date lives in the values, not the key.
    $second = $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 9, 'paid_at' => '2026-10-07'])
        ->assertCreated()
        ->assertJsonPath('data.paid_at', '2026-10-03T00:00:00+00:00')
        ->json('data.id');

    expect($second)->toBe($first)
        ->and(AthletePayment::query()->count())->toBe(1);
});

it('dates a payment today when no date is sent', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", ['year' => 2026, 'month' => 10])
        ->assertCreated();

    expect(AthletePayment::query()->sole()->paid_at->toDateString())->toBe('2026-10-10');
});

it('refuses a date that has not happened, or one it cannot read unambiguously', function (string $paidAt): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 9, 'paid_at' => $paidAt,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['paid_at']);

    expect(AthletePayment::query()->count())->toBe(0);
})->with([
    'tomorrow' => ['2026-10-11'],
    'day first, as a person types it' => ['03/10/2026'],
    'a datetime with an offset' => ['2026-10-03T23:30:00-02:00'],
]);

// ─── The method ───────────────────────────────────────────────────────────────

it('records how a fee was paid, and leaves it unrecorded when not said', function (): void {
    $url = "/api/v1/athletes/{$this->athlete->id}/payments";

    $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 9, 'payment_method' => 'transfer'])
        ->assertCreated()
        ->assertJsonPath('data.payment_method', 'transfer');

    // Null is "not recorded", never a guess.
    $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 10])
        ->assertCreated()
        ->assertJsonPath('data.payment_method', null);

    expect(AthletePayment::query()->where('month', 9)->sole()->payment_method)->toBe(PaymentMethod::Transfer);
});

it('refuses a method it does not know, on a fee and on a carnet', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 9, 'payment_method' => 'bitcoin',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['payment_method']);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['payment_method' => 'bitcoin'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['payment_method']);

    expect(AthletePayment::query()->count())->toBe(0)
        ->and(Carnet::query()->count())->toBe(0);
});

it('records how a carnet was paid', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['payment_method' => 'cash'])
        ->assertCreated()
        ->assertJsonPath('data.payment_method', 'cash');

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [])
        ->assertCreated()
        ->assertJsonPath('data.payment_method', null);

    expect(Carnet::query()->whereNotNull('payment_method')->sole()->payment_method)->toBe(PaymentMethod::Cash);
});

it('shows the method on the ledger and in the carnet list', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 9, 'paid_at' => '2026-10-03', 'payment_method' => 'pos',
        ])
        ->assertCreated();
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['payment_method' => 'other'])
        ->assertCreated();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/payments")
        ->assertOk()
        ->assertJsonPath('data.0.payment_method', 'pos')
        ->assertJsonPath('data.0.paid_at', '2026-10-03T00:00:00+00:00');

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonPath('data.0.payment_method', 'other');
});

// ─── The audit trail ──────────────────────────────────────────────────────────

it('writes the date and the method into the audit trail of both', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 9, 'paid_at' => '2026-10-03', 'payment_method' => 'cash',
        ])
        ->assertCreated();
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['payment_method' => 'transfer'])
        ->assertCreated();

    $payment = AuditEntry::query()->where('action', 'payment.created')->sole();
    $carnet = AuditEntry::query()->where('action', 'carnet.created')->sole();

    expect($payment->after['payment_method'] ?? null)->toBe('cash')
        ->and((string) ($payment->after['paid_at'] ?? ''))->toStartWith('2026-10-03')
        ->and($carnet->after['payment_method'] ?? null)->toBe('transfer');
});
