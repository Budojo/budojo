<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademyFeeTier;
use App\Models\AcademyMembership;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\User;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update(['monthly_fee_cents' => 6500]);
});

// ─── GET /academy/fee-tiers ──────────────────────────────────────────────────

it('lists the academy price list ordered by how often you train', function (): void {
    $three = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['label' => '3 lezioni', 'amount_cents' => 6500, 'lessons_per_week' => 3]);
    $two = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['label' => '2 lezioni', 'amount_cents' => 5500, 'lessons_per_week' => 2]);

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy/fee-tiers')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.id', $two->id)
        ->assertJsonPath('data.0.label', '2 lezioni')
        ->assertJsonPath('data.0.amount_cents', 5500)
        ->assertJsonPath('data.0.lessons_per_week', 2)
        ->assertJsonPath('data.1.id', $three->id);
});

it('never lists another academy tiers', function (): void {
    AcademyFeeTier::factory()->create(['label' => 'Altrove']);

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy/fee-tiers')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('counts how many athletes are on each tier, so deleting one is a decision', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create();
    Athlete::factory()->count(2)->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);
    Athlete::factory()->for($this->user->academy)->create();

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy/fee-tiers')
        ->assertOk()
        ->assertJsonPath('data.0.athletes_count', 2);
});

// ─── POST /academy/fee-tiers ─────────────────────────────────────────────────

it('creates a tier', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/fee-tiers', [
            'label' => '2 lezioni',
            'amount_cents' => 5500,
            'lessons_per_week' => 2,
        ])
        ->assertCreated()
        ->assertJsonPath('data.label', '2 lezioni')
        ->assertJsonPath('data.amount_cents', 5500)
        ->assertJsonPath('data.athletes_count', 0);

    expect(AcademyFeeTier::where('academy_id', $this->user->academy->id)->count())->toBe(1);
});

it('refuses a second tier with the same label in the same academy', function (): void {
    AcademyFeeTier::factory()->for($this->user->academy)->create(['label' => '2 lezioni']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/fee-tiers', [
            'label' => '2 lezioni',
            'amount_cents' => 6000,
            'lessons_per_week' => 2,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('label');
});

it('allows two academies to use the same label', function (): void {
    AcademyFeeTier::factory()->create(['label' => '2 lezioni']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/fee-tiers', [
            'label' => '2 lezioni',
            'amount_cents' => 5500,
            'lessons_per_week' => 2,
        ])
        ->assertCreated();
});

it('accepts a free tier — the black belt who trains for nothing', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/fee-tiers', [
            'label' => 'Esente',
            'amount_cents' => 0,
            'lessons_per_week' => 3,
        ])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 0);
});

it('rejects a lesson count nobody could train', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/fee-tiers', [
            'label' => 'Assurda',
            'amount_cents' => 5500,
            'lessons_per_week' => 0,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('lessons_per_week');
});

// ─── PATCH /academy/fee-tiers/{tier} ─────────────────────────────────────────

it('re-prices a tier without touching what has already been paid', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['label' => '2 lezioni', 'amount_cents' => 5500, 'lessons_per_week' => 2]);
    $athlete = Athlete::factory()->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertCreated();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/fee-tiers/{$tier->id}", ['amount_cents' => 6000])
        ->assertOk()
        ->assertJsonPath('data.amount_cents', 6000)
        // Untouched fields survive a partial update.
        ->assertJsonPath('data.label', '2 lezioni');

    // The snapshot on the payment is what the athlete actually handed over.
    expect(AthletePayment::where('athlete_id', $athlete->id)->value('amount_cents'))->toBe(5500);
});

it('lets a tier keep its own label when only the price moves', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create(['label' => '2 lezioni']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/fee-tiers/{$tier->id}", [
            'label' => '2 lezioni',
            'amount_cents' => 6000,
        ])
        ->assertOk();
});

it('refuses to re-price another academy tier', function (): void {
    $foreign = AcademyFeeTier::factory()->create();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/fee-tiers/{$foreign->id}", ['amount_cents' => 1])
        ->assertForbidden();

    expect($foreign->fresh()?->amount_cents)->not->toBe(1);
});

// ─── DELETE /academy/fee-tiers/{tier} ────────────────────────────────────────

it('drops a tier and leaves the athletes who were on it', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['amount_cents' => 5500]);
    $athlete = Athlete::factory()->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/fee-tiers/{$tier->id}")
        ->assertNoContent();

    $athlete->refresh();
    expect($athlete->exists)->toBeTrue()
        ->and($athlete->fee_tier_id)->toBeNull();

    // And they fall back to the academy fee rather than to nothing.
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 5])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 6500);
});

it('refuses to delete another academy tier', function (): void {
    $foreign = AcademyFeeTier::factory()->create();

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/academy/fee-tiers/{$foreign->id}")
        ->assertForbidden();

    expect(AcademyFeeTier::find($foreign->id))->not->toBeNull();
});

// ─── Who may touch the price list ────────────────────────────────────────────

it('lets any member read the price list but only settings-holders write it', function (
    string $role,
    bool $mayWrite,
): void {
    $academy = Academy::factory()->create();
    $member = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($member)->for($academy)->create(['role' => $role]);

    $this->actingAs($member)->getJson('/api/v1/academy/fee-tiers')->assertOk();

    $write = $this->actingAs($member)->postJson('/api/v1/academy/fee-tiers', [
        'label' => 'Prova',
        'amount_cents' => 5500,
        'lessons_per_week' => 2,
    ]);

    $mayWrite ? $write->assertCreated() : $write->assertForbidden();
})->with([
    'owner' => ['owner', true],
    'admin' => ['admin', true],
    'instructor' => ['instructor', false],
    'assistant' => ['assistant', false],
]);

// ─── The rule the whole feature exists for ───────────────────────────────────

it('charges the tier amount when the athlete is on one', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['amount_cents' => 5500, 'lessons_per_week' => 2]);
    $athlete = Athlete::factory()->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 5500);
});

it('charges the academy fee when the athlete is on no tier', function (): void {
    $athlete = Athlete::factory()->for($this->user->academy)->create();

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 6500);
});

it('records nothing when the athlete is on no tier and the academy set no fee', function (): void {
    $this->user->academy->update(['monthly_fee_cents' => null]);
    $athlete = Athlete::factory()->for($this->user->academy)->create();

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertStatus(422);
});

it('charges the tier even when the academy itself has no flat fee', function (): void {
    $this->user->academy->update(['monthly_fee_cents' => null]);
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create(['amount_cents' => 5500]);
    $athlete = Athlete::factory()->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2026, 'month' => 4])
        ->assertCreated()
        ->assertJsonPath('data.amount_cents', 5500);
});

// ─── Putting an athlete on a tier ────────────────────────────────────────────

it('moves an athlete onto a tier and reports the fee that now applies', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)
        ->create(['label' => '2 lezioni', 'amount_cents' => 5500, 'lessons_per_week' => 2]);
    $athlete = Athlete::factory()->for($this->user->academy)->create();

    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['fee_tier_id' => $tier->id])
        ->assertOk()
        ->assertJsonPath('data.fee_tier.id', $tier->id)
        ->assertJsonPath('data.fee_tier.label', '2 lezioni')
        ->assertJsonPath('data.fee_tier.lessons_per_week', 2)
        ->assertJsonPath('data.monthly_fee_cents', 5500);
});

it('takes an athlete off a tier and hands them back the academy fee', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create(['amount_cents' => 5500]);
    $athlete = Athlete::factory()->for($this->user->academy)->create(['fee_tier_id' => $tier->id]);

    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['fee_tier_id' => null])
        ->assertOk()
        ->assertJsonPath('data.fee_tier', null)
        ->assertJsonPath('data.monthly_fee_cents', 6500);
});

it('refuses a tier that belongs to another academy', function (): void {
    $foreign = AcademyFeeTier::factory()->create();
    $athlete = Athlete::factory()->for($this->user->academy)->create();

    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['fee_tier_id' => $foreign->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('fee_tier_id');
});

it('serves the roster without one fee query per athlete', function (): void {
    $tier = AcademyFeeTier::factory()->for($this->user->academy)->create();

    $rosterCost = function (int $athletes) use ($tier): int {
        Athlete::query()->forceDelete();
        Athlete::factory()->count($athletes)->for($this->user->academy)
            ->create(['fee_tier_id' => $tier->id]);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->user)->getJson('/api/v1/athletes')->assertOk();
        $count = count(DB::getRawQueryLog());
        DB::disableQueryLog();

        return $count;
    };

    expect($rosterCost(6))->toBe($rosterCost(2));
});
