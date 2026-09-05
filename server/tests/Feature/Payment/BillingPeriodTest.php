<?php

declare(strict_types=1);

use App\Enums\BillingPeriod;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update(['monthly_fee_cents' => 5500]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

/** Records a payment through the API and returns the decoded `data` block. */
function recordPayment(mixed $test, Athlete $athlete, array $body): array
{
    return $test->actingAs($test->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", $body)
        ->assertCreated()
        ->json('data');
}

// ─── The containment rule ────────────────────────────────────────────────────

it('covers every month of the period it starts, and none after', function (): void {
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 2, 'period_months' => BillingPeriod::Quarterly,
    ]);

    $covered = fn (int $y, int $m): bool => AthletePayment::query()
        ->where('athlete_id', $this->athlete->id)
        ->covering($y, $m)
        ->exists();

    expect($covered(2026, 1))->toBeFalse()
        ->and($covered(2026, 2))->toBeTrue()
        ->and($covered(2026, 3))->toBeTrue()
        ->and($covered(2026, 4))->toBeTrue()
        ->and($covered(2026, 5))->toBeFalse();
});

it('carries an annual payment across the new year', function (): void {
    // The arithmetic that a naive `where year = ? and month = ?` cannot do:
    // a period that starts in November 2026 reaches into 2027.
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2026, 'month' => 11, 'period_months' => BillingPeriod::Annual,
    ]);

    $covered = fn (int $y, int $m): bool => AthletePayment::query()
        ->where('athlete_id', $this->athlete->id)
        ->covering($y, $m)
        ->exists();

    expect($covered(2026, 10))->toBeFalse()
        ->and($covered(2026, 12))->toBeTrue()
        ->and($covered(2027, 1))->toBeTrue()
        ->and($covered(2027, 10))->toBeTrue()
        ->and($covered(2027, 11))->toBeFalse();
});

it('treats a monthly payment exactly as it did before periods existed', function (): void {
    AthletePayment::factory()->for($this->athlete)->create(['year' => 2026, 'month' => 4]);

    $covered = fn (int $y, int $m): bool => AthletePayment::query()
        ->where('athlete_id', $this->athlete->id)
        ->covering($y, $m)
        ->exists();

    expect($covered(2026, 3))->toBeFalse()
        ->and($covered(2026, 4))->toBeTrue()
        ->and($covered(2026, 5))->toBeFalse();
});

// ─── Recording ───────────────────────────────────────────────────────────────

it('records a quarterly payment as one row for three times the fee', function (): void {
    $data = recordPayment($this, $this->athlete, [
        'year' => 2026, 'month' => 2, 'period_months' => 3,
    ]);

    expect($data['period_months'])->toBe(3)
        ->and($data['amount_cents'])->toBe(16500)
        // One payment, one receipt — not three monthly rows pretending.
        ->and(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('multiplies the athlete tier price, not the academy fee', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create(['amount_cents' => 6500]);
    $this->athlete->update(['fee_tier_id' => $tier->id]);

    $data = recordPayment($this, $this->athlete, [
        'year' => 2026, 'month' => 1, 'period_months' => 6,
    ]);

    expect($data['amount_cents'])->toBe(39000);
});

it('falls back to the athlete own billing period when the request omits one', function (): void {
    $this->athlete->update(['billing_period_months' => 12]);

    $data = recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 1]);

    expect($data['period_months'])->toBe(12)
        ->and($data['amount_cents'])->toBe(66000);
});

it('still defaults to a single month for an athlete nobody configured', function (): void {
    $data = recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 4]);

    expect($data['period_months'])->toBe(1)
        ->and($data['amount_cents'])->toBe(5500);
});

it('rejects a period length that is not one of the four offered', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 2, 'period_months' => 7,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('period_months');
});

// ─── Overlap: the invariant the unique index no longer carries ───────────────

it('refuses a month already inside an existing period', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    // March starts in a different month than February, so the unique index
    // lets it through — the rejection has to come from the Action.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 3,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('period_months');

    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('refuses a long period that swallows an existing short one', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 5]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 1, 'period_months' => 12,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('period_months');
});

it('allows two periods that merely touch', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 1, 'period_months' => 3]);

    // Jan-Mar then Apr-Jun: adjacent, not overlapping. Rejecting this would
    // make renewing impossible.
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 4, 'period_months' => 3]);

    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(2);
});

it('stays idempotent on an identical re-post', function (): void {
    $first = recordPayment($this, $this->athlete, [
        'year' => 2026, 'month' => 2, 'period_months' => 3,
    ]);
    $second = recordPayment($this, $this->athlete, [
        'year' => 2026, 'month' => 2, 'period_months' => 3,
    ]);

    // Re-posting the same period is the double-click case, not an overlap.
    expect($second['id'])->toBe($first['id'])
        ->and(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('refuses to re-post the same start month with a different length', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    // Not a double-click: the caller is asking for something else. Silently
    // returning the quarterly would claim they paid for a year.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", [
            'year' => 2026, 'month' => 2, 'period_months' => 12,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('period_months');
});

// ─── Undoing ─────────────────────────────────────────────────────────────────

it('removes the whole period from any month inside it', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    // The owner is looking at April and clicks unmark; the quarterly covering
    // April is what comes off. One payment, one receipt, one deletion.
    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/4")
        ->assertNoContent();

    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(0);
});

it('answers 404 when no period covers the month being undone', function (): void {
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/6")
        ->assertNotFound();

    expect(AthletePayment::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

// ─── Every read surface ──────────────────────────────────────────────────────

it('reports the athlete as paid for a month inside a period they did not start', function (): void {
    $this->travelTo('2026-04-15');
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.paid_current_month', true);
});

it('keeps an athlete covered by a period out of the unpaid filter', function (): void {
    $this->travelTo('2026-04-15');
    $other = Athlete::factory()->for($this->user->academy)->create();
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    $ids = $this->actingAs($this->user)
        ->getJson('/api/v1/athletes?paid=no')
        ->assertOk()
        ->json('data.*.id');

    expect($ids)->toContain($other->id)
        ->and($ids)->not->toContain($this->athlete->id);
});

it('lists a period that started last year but reaches into this one', function (): void {
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2025, 'month' => 12, 'period_months' => BillingPeriod::Quarterly,
    ]);

    // The twelve-month table for 2026 has to show January and February as
    // covered, so the payment behind them must come back with the year.
    $data = $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/payments?year=2026")
        ->assertOk()
        ->json('data');

    expect($data)->toHaveCount(1)
        ->and($data[0]['year'])->toBe(2025)
        ->and($data[0]['month'])->toBe(12)
        ->and($data[0]['period_months'])->toBe(3);
});

it('leaves a period that ends before the listed year out of it', function (): void {
    AthletePayment::factory()->for($this->athlete)->create([
        'year' => 2025, 'month' => 9, 'period_months' => BillingPeriod::Quarterly,
    ]);

    $data = $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/payments?year=2026")
        ->assertOk()
        ->json('data');

    expect($data)->toBeEmpty();
});

it('lets a period pay for a carnet-covered month, freeing its entries', function (): void {
    // The monthly fee's precedence over a carnet is evaluated from the facts
    // since #1380 — a period has to grant that precedence for every month it
    // covers, not just the one it starts in.
    $this->user->academy->update(['carnet_price_cents' => 7000, 'carnet_entries' => 10]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-02-01',
            'valid_from' => '2026-02-01',
        ])
        ->assertCreated();

    $this->actingAs($this->user)
        ->postJson('/api/v1/attendance', [
            'athlete_ids' => [$this->athlete->id],
            'date' => '2026-04-08',
        ])
        ->assertCreated();

    $remaining = fn (): int => $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->json('data.0.remaining_entries');

    expect($remaining())->toBe(9);

    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    expect($remaining())->toBe(10);
});

// ─── The scheduled reminders ─────────────────────────────────────────────────

it('leaves an athlete inside a paid period out of the owner digest', function (): void {
    $this->travelTo('2026-04-16');
    $other = Athlete::factory()->for($this->user->academy)->create();
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    Mail::fake();
    $this->artisan('budojo:send-unpaid-athletes-digest')->assertSuccessful();

    Mail::assertQueued(UnpaidAthletesDigestMail::class, function (UnpaidAthletesDigestMail $mail) use ($other): bool {
        $listed = $mail->athletes->pluck('id')->all();

        // The quarterly athlete is square for April; only the unpaid one is
        // worth the owner's attention.
        return in_array($other->id, $listed, true)
            && ! in_array($this->athlete->id, $listed, true);
    });
});

it('does not chase an athlete whose period still covers this month', function (): void {
    $this->travelTo('2026-04-06');
    $user = User::factory()->create();
    $this->athlete->update(['user_id' => $user->id]);
    recordPayment($this, $this->athlete, ['year' => 2026, 'month' => 2, 'period_months' => 3]);

    Notification::fake();
    $this->artisan('budojo:send-athlete-payment-overdue-pushes')->assertSuccessful();

    Notification::assertNothingSent();
});
