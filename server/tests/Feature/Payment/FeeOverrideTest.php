<?php

declare(strict_types=1);

use App\Models\AcademyFeeTier;
use App\Models\Athlete;
use App\Support\MonthlyFee;

/**
 * #1757 — a monthly fee for one athlete only: the black belt who trains free,
 * the discounted friend. The second half of #1381's "default plus deroga".
 *
 * **0 and null are different states.** Null: no override, the tier or the
 * academy fee applies. Zero: this athlete pays nothing, and nothing is owed.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-20');
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['monthly_fee_cents' => 5500]);
    $this->tier = AcademyFeeTier::factory()->for($this->academy)->create(['amount_cents' => 6500]);
});

it('resolves the override first, the tier next, the academy fee last', function (): void {
    $free = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => $this->tier->id, 'fee_override_cents' => 0]);
    $onTier = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => $this->tier->id, 'fee_override_cents' => null]);
    $discounted = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => null, 'fee_override_cents' => 4000]);

    // A `?:` or a truthiness test would send the zero to the tier: 6500.
    expect(MonthlyFee::forAthlete($free))->toBe(0)
        ->and(MonthlyFee::forAthlete($onTier))->toBe(6500)
        ->and(MonthlyFee::forAthlete($discounted))->toBe(4000);
});

it('sends the resolved fee and the override on the roster', function (): void {
    $free = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => $this->tier->id, 'fee_override_cents' => 0]);

    $row = collect($this->actingAs($this->user)->getJson('/api/v1/athletes')->assertOk()->json('data'))
        ->firstWhere('id', $free->id);

    expect($row['monthly_fee_cents'])->toBe(0)
        ->and($row['fee_override_cents'])->toBe(0);
});

it('sets, changes and clears the override through the athlete form', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fee_override_cents' => 0])
        ->assertOk()->assertJsonPath('data.fee_override_cents', 0)->assertJsonPath('data.monthly_fee_cents', 0);
    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fee_override_cents' => 3000])
        ->assertOk()->assertJsonPath('data.monthly_fee_cents', 3000);
    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fee_override_cents' => null])
        ->assertOk()->assertJsonPath('data.fee_override_cents', null)->assertJsonPath('data.monthly_fee_cents', 5500);
});

it('takes the override when the athlete is created', function (): void {
    // The form sends it on create too; without the shared rule it was dropped.
    $this->actingAs($this->user)->postJson('/api/v1/athletes', [
        'first_name' => 'Rickson',
        'last_name' => 'Free',
        'belt' => 'black',
        'status' => 'active',
        'joined_at' => '2026-09-01',
        'fee_override_cents' => 0,
    ])->assertCreated()->assertJsonPath('data.fee_override_cents', 0)->assertJsonPath('data.monthly_fee_cents', 0);
});

it('refuses a negative or absurd override', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();

    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fee_override_cents' => -1])
        ->assertUnprocessable()->assertJsonValidationErrors(['fee_override_cents']);
    $this->actingAs($this->user)->putJson("/api/v1/athletes/{$athlete->id}", ['fee_override_cents' => 1_000_001])
        ->assertUnprocessable()->assertJsonValidationErrors(['fee_override_cents']);
});

it('owes nothing when the athlete trains free, and owes the override otherwise', function (): void {
    $free = Athlete::factory()->for($this->academy)->create(['fee_override_cents' => 0]);
    $discounted = Athlete::factory()->for($this->academy)->create(['fee_override_cents' => 4000]);

    $owing = $this->actingAs($this->user)->getJson('/api/v1/athletes?paid=no')->assertOk()->json('data.*.id');

    expect($owing)->not->toContain($free->id)
        ->and($owing)->toContain($discounted->id)
        ->and(Athlete::query()->chargedMoreThanNothing()->pluck('id')->all())
        ->toContain($discounted->id)
        ->not->toContain($free->id);
});

it('owes a personal fee even where the academy charges none', function (): void {
    $this->academy->update(['monthly_fee_cents' => null]);
    $discounted = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => null, 'fee_override_cents' => 4000]);
    $nobody = Athlete::factory()->for($this->academy)->create(['fee_tier_id' => null, 'fee_override_cents' => null]);

    $owing = $this->actingAs($this->user)->getJson('/api/v1/athletes?paid=no')->assertOk()->json('data.*.id');

    expect($owing)->toContain($discounted->id)->not->toContain($nobody->id);
});

it('still records a payment for someone who trains free', function (): void {
    // A fee of zero is a fee that applies: the 422 is for no fee at all.
    $free = Athlete::factory()->for($this->academy)->create(['fee_override_cents' => 0]);

    $this->actingAs($this->user)->postJson("/api/v1/athletes/{$free->id}/payments", ['year' => 2026, 'month' => 9])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 0);
});
