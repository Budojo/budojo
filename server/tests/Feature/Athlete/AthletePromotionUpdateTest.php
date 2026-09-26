<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Support\OperatorDay;

/**
 * Feature tests for `PATCH /api/v1/athletes/{athlete}/promotions/{promotion}`
 * — the first of two PRs on #1431 ("devo poter riscrivere la storia di un
 * atleta"). Scope is narrow on purpose: only `recorded_at` moves. The kind,
 * the belt/stripe transition, and who recorded it describe the event itself
 * and are read-only here; creating/deleting historical rows is PR 2.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue, 'stripes' => 2]);
    $this->athlete = $athlete;
});

it("corrects a promotion's recorded_at without touching the transition it describes", function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'stripe',
        'from_stripes' => 1,
        'to_stripes' => 2,
        'belt_at_event' => Belt::Blue,
        'recorded_at' => '2026-09-01 10:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $response = $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => '2026-03-15',
        ])
        ->assertOk();

    expect($response->json('data.recorded_at'))->toStartWith('2026-03-15')
        ->and($response->json('data.kind'))->toBe('stripe')
        ->and($response->json('data.from_stripes'))->toBe(1)
        ->and($response->json('data.to_stripes'))->toBe(2);

    $promotion->refresh();
    expect($promotion->recorded_at->toDateString())->toBe('2026-03-15');
});

it("never changes the athlete's current belt or stripes", function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'kind' => 'belt',
        'from_belt' => Belt::Purple,
        'to_belt' => Belt::Blue,
        'belt_at_event' => Belt::Blue,
        'recorded_at' => '2026-09-01 10:00:00',
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => '2020-01-01',
        ])
        ->assertOk();

    $this->athlete->refresh();
    expect($this->athlete->belt)->toBe(Belt::Blue)
        ->and($this->athlete->stripes)->toBe(2)
        // The write goes straight through the model, bypassing the
        // athlete-change observer entirely — no new AthletePromotion
        // row should appear alongside the one being edited.
        ->and(AthletePromotion::where('athlete_id', $this->athlete->id)->count())->toBe(1);
});

it('rejects a promotion that belongs to a different athlete', function (): void {
    /** @var Athlete $other */
    $other = Athlete::factory()->for($this->academy)->create();
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $other->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => '2026-01-01',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('rejects cross-academy edits with 403', function (): void {
    $otherOwner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($otherOwner->academy)->create();
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $athlete->id,
        'recorded_by_user_id' => $otherOwner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => '2026-01-01',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
        'recorded_at' => '2026-01-01',
    ])->assertStatus(401);
});

it('requires recorded_at', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['recorded_at']);
});

it('refuses a recorded_at in the future — a promotion cannot happen ahead of today', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => OperatorDay::today()->addDay()->toDateString(),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['recorded_at']);
});

it('rejects a malformed date', function (): void {
    /** @var AthletePromotion $promotion */
    $promotion = AthletePromotion::factory()->create([
        'athlete_id' => $this->athlete->id,
        'recorded_by_user_id' => $this->owner->id,
    ]);

    $this->actingAs($this->owner)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/promotions/{$promotion->id}", [
            'recorded_at' => 'not-a-date',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['recorded_at']);
});
