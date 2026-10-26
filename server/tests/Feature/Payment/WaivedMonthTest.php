<?php

declare(strict_types=1);

use App\Actions\Payment\ReconcileCarnetEntriesAction;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\User;
use App\Notifications\AthletePaymentMarkedPaidNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

/**
 * A month the owner lets an athlete off (#2167): someone who helped with the
 * gym does not pay October. Not «Si allena gratis» (#2011), which is every
 * month from now on, and not a payment, which brought money in.
 *
 * Today is 20 October 2026; fees are kept in Budojo since March, at €55.
 */
beforeEach(function (): void {
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 10, 20, 12));

    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['monthly_fee_cents' => 5500, 'billing_from' => '2026-03-01']);
    $this->jacopo = Athlete::factory()->for($this->academy)->create([
        'first_name' => 'Jacopo',
        'last_name' => 'Neri',
        'joined_at' => '2025-01-10',
        'fee_tier_id' => null,
        'fee_override_cents' => null,
    ]);
});

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

/** Lets Jacopo off the month. */
function waivedLetOff(object $test, int $month, array $extra = []): Illuminate\Testing\TestResponse
{
    Sanctum::actingAs($test->user);

    return $test->postJson("/api/v1/athletes/{$test->jacopo->id}/payments", [
        'year' => 2026,
        'month' => $month,
        'waived' => true,
        ...$extra,
    ]);
}

/** Jacopo's row on the roster. */
function waivedOnRoster(object $test, string $query = ''): ?array
{
    Sanctum::actingAs($test->user);

    return collect($test->getJson('/api/v1/athletes' . $query)->assertOk()->json('data'))
        ->firstWhere('id', $test->jacopo->id);
}

it('records the month at nothing, with no method, as one let off', function (): void {
    $data = waivedLetOff($this, 10)->assertCreated()->json('data');

    expect($data)->toMatchArray([
        'year' => 2026,
        'month' => 10,
        'period_months' => 1,
        'amount_cents' => 0,
        'payment_method' => null,
        'waived' => true,
    ]);
});

it('dates it the day the owner gave it, today unless said', function (): void {
    expect(waivedLetOff($this, 10)->json('data.paid_at'))->toStartWith('2026-10-20')
        ->and(waivedLetOff($this, 9, ['paid_at' => '2026-10-02'])->json('data.paid_at'))->toStartWith('2026-10-02');
});

it('says a paid month was paid', function (): void {
    Sanctum::actingAs($this->user);

    $data = $this->postJson("/api/v1/athletes/{$this->jacopo->id}/payments", ['year' => 2026, 'month' => 10])
        ->assertCreated()
        ->json('data');

    expect($data['waived'])->toBeFalse()
        ->and($data['amount_cents'])->toBe(5500);
});

it('lets off one month, even for someone who pays by the quarter', function (): void {
    $this->jacopo->update(['billing_period_months' => 3]);

    expect(waivedLetOff($this, 10)->assertCreated()->json('data.period_months'))->toBe(1);
});

it('refuses a month let off with a longer period, or a method', function (array $extra, string $field): void {
    waivedLetOff($this, 10, $extra)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'a quarter' => [['period_months' => 3], 'period_months'],
    'cash' => [['payment_method' => 'cash'], 'payment_method'],
]);

it('takes the athlete off the unpaid list and names the month on the roster', function (): void {
    expect(waivedOnRoster($this, '?paid=no'))->not->toBeNull();

    waivedLetOff($this, 10)->assertCreated();

    expect(waivedOnRoster($this, '?paid=no'))->toBeNull()
        ->and(waivedOnRoster($this))->toMatchArray([
            'payment_coverage' => 'waived',
            'paid_current_month' => true,
        ]);
});

it('owes nothing for a past month let off: not in the arrears, not late on the ledger', function (): void {
    foreach ([3, 4, 5, 6, 7, 8] as $month) {
        AthletePayment::factory()->for($this->jacopo)->create(['year' => 2026, 'month' => $month, 'amount_cents' => 5500]);
    }
    Sanctum::actingAs($this->user);
    $arrears = fn (): ?array => collect($this->getJson('/api/v1/stats/payments/arrears')->assertOk()->json('data'))
        ->first(fn (array $row): bool => $row['athlete']['id'] === $this->jacopo->id);
    $late = fn (): array => $this->getJson("/api/v1/athletes/{$this->jacopo->id}/payments?year=2026")
        ->assertOk()
        ->json('overdue_months');

    expect($late())->toBe(['2026-09'])
        ->and($arrears())->not->toBeNull();

    waivedLetOff($this, 9)->assertCreated();

    expect($late())->toBe([])
        ->and($arrears())->toBeNull();
});

it('leaves the month out of the money: nothing collected, nothing expected, nothing outstanding', function (): void {
    $marco = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-01-10', 'fee_tier_id' => null, 'fee_override_cents' => null]);
    AthletePayment::factory()->for($marco)->create(['year' => 2026, 'month' => 10, 'amount_cents' => 5500]);
    waivedLetOff($this, 10)->assertCreated();

    $summary = $this->getJson('/api/v1/stats/payments/summary?year=2026&month=10')->assertOk()->json('data');

    // Expected only Marco's: the owner chose not to ask Jacopo, so the
    // collection rate is not dragged down by it.
    expect($summary)->toMatchArray([
        'expected_cents' => 5500,
        'collected_cents' => 5500,
        'outstanding_count' => 0,
        'outstanding_cents' => 0,
        'collection_rate' => 1.0,
    ]);
});

it('leaves a month let off out of the accountant\'s file', function (): void {
    waivedLetOff($this, 10)->assertCreated();

    $csv = $this->get('/api/v1/stats/payments/export?season=2026')->assertOk()->streamedContent();

    expect($csv)->not->toContain('Jacopo');
});

it('tells the athlete nothing was paid: no "payment received" notice', function (): void {
    Notification::fake();
    $account = User::factory()->create();
    $this->jacopo->update(['user_id' => $account->id]);

    waivedLetOff($this, 10)->assertCreated();

    Notification::assertNotSentTo($account, AthletePaymentMarkedPaidNotification::class);
});

it('charges no carnet entry for a month let off, as for a month paid', function (): void {
    $carnet = Carnet::factory()->for($this->jacopo)->purchasedOn('2026-10-01')->create(['total_entries' => 10]);
    AttendanceRecord::factory()->for($this->jacopo)->create(['attended_on' => '2026-10-07']);
    app(ReconcileCarnetEntriesAction::class)->execute([$this->jacopo->id]);
    expect($carnet->entries()->count())->toBe(1);

    waivedLetOff($this, 10)->assertCreated();

    expect($carnet->entries()->count())->toBe(0);
});

it('answers a second tap with the same month, and refuses to pay it or let off a paid one', function (): void {
    $first = waivedLetOff($this, 10)->assertCreated()->json('data.id');

    expect(waivedLetOff($this, 10)->assertOk()->json('data.id'))->toBe($first);

    $this->postJson("/api/v1/athletes/{$this->jacopo->id}/payments", ['year' => 2026, 'month' => 10])
        ->assertUnprocessable();
    $this->postJson("/api/v1/athletes/{$this->jacopo->id}/payments", ['year' => 2026, 'month' => 11])
        ->assertCreated();
    waivedLetOff($this, 11)->assertUnprocessable();
});

it('is undone like a payment, and the month is owed again', function (): void {
    waivedLetOff($this, 10)->assertCreated();

    $this->deleteJson("/api/v1/athletes/{$this->jacopo->id}/payments/2026/10")->assertNoContent();

    expect(waivedOnRoster($this))->toMatchArray(['payment_coverage' => 'none', 'paid_current_month' => false]);
});
