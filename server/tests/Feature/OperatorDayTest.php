<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use Illuminate\Http\UploadedFile;

/**
 * #1963 — "today" is the operator's day, not UTC's.
 *
 * 22:30 UTC on 10 October is 00:30 on the 11th in Rome: the owner recording
 * tonight's class after midnight picks the 11th, which UTC still calls
 * tomorrow. Every "not after today" rule used to refuse it, and every
 * "the day it happened" default dated it the 10th.
 */
beforeEach(function (): void {
    $this->travelTo('2026-10-10 22:30:00');

    $this->user = userWithAcademy();
    $this->user->academy->update([
        'monthly_fee_cents' => 9500,
        'carnet_price_cents' => 7000,
        'carnet_entries' => 10,
    ]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 0,
        'joined_at' => '2025-01-01',
    ]);
});

it('accepts attendance on the operator\'s today, and still refuses tomorrow', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/attendance', ['athlete_ids' => [$this->athlete->id], 'date' => '2026-10-11'])
        ->assertSuccessful();

    $this->actingAs($this->user)
        ->postJson('/api/v1/attendance', ['athlete_ids' => [$this->athlete->id], 'date' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date');
});

it('accepts a carnet sold and valid from the operator\'s today, and dates an undated sale to it', function (): void {
    $url = "/api/v1/athletes/{$this->athlete->id}/carnets";

    $this->actingAs($this->user)
        ->postJson($url, ['purchased_at' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('purchased_at');
    $this->actingAs($this->user)
        ->postJson($url, ['valid_from' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('valid_from');

    $this->actingAs($this->user)
        ->postJson($url, ['purchased_at' => '2026-10-11', 'valid_from' => '2026-10-11'])
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', '2026-10-11');

    // No date sent: the sale happened today — the operator's today.
    Carnet::query()->delete();
    $this->actingAs($this->user)
        ->postJson($url, [])
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', '2026-10-11');
});

it('accepts a carnet validity moved to the operator\'s today, and still refuses tomorrow', function (): void {
    $carnet = $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['purchased_at' => '2026-10-01'])
        ->assertCreated()
        ->json('data.id');
    $url = "/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet}";

    $this->actingAs($this->user)->patchJson($url, ['valid_from' => '2026-10-11'])->assertOk();
    $this->actingAs($this->user)
        ->patchJson($url, ['valid_from' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('valid_from');
});

it('accepts a payment made on the operator\'s today, and dates an undated one to it', function (): void {
    $url = "/api/v1/athletes/{$this->athlete->id}/payments";

    $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 9, 'paid_at' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('paid_at');

    $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 9, 'paid_at' => '2026-10-11'])
        ->assertCreated()
        ->assertJsonPath('data.paid_at', '2026-10-11T00:00:00+00:00');

    // No date sent: the money arrived today — the operator's today, stored
    // the same way a chosen date is.
    $this->actingAs($this->user)
        ->postJson($url, ['year' => 2026, 'month' => 10])
        ->assertCreated()
        ->assertJsonPath('data.paid_at', '2026-10-11T00:00:00+00:00');

    expect(AthletePayment::query()->count())->toBe(2);
});

it('accepts a promotion dated the operator\'s today, and still refuses tomorrow', function (): void {
    $url = "/api/v1/athletes/{$this->athlete->id}/promotions";

    $this->actingAs($this->user)
        ->postJson($url, ['kind' => 'stripe', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1, 'recorded_at' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('recorded_at');

    $id = $this->actingAs($this->user)
        ->postJson($url, ['kind' => 'stripe', 'belt_at_event' => 'blue', 'from_stripes' => 0, 'to_stripes' => 1, 'recorded_at' => '2026-10-11'])
        ->assertCreated()
        ->json('data.id');

    $this->actingAs($this->user)
        ->patchJson("{$url}/{$id}", ['recorded_at' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('recorded_at');
    $this->actingAs($this->user)
        ->patchJson("{$url}/{$id}", ['recorded_at' => '2026-10-11'])
        ->assertOk();
});

it('accepts a billing floor in the operator\'s month, and still refuses a later day', function (): void {
    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['billing_from' => '2026-10-11'])
        ->assertOk()
        ->assertJsonPath('data.billing_from', '2026-10-01');

    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['billing_from' => '2026-10-12'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('billing_from');
});

it('dates an imported athlete with no joining column to the operator\'s today', function (): void {
    $csv = UploadedFile::fake()->createWithContent('atleti.csv', "Nome;Cognome;Cintura\nMario;Rossi;Blu\n");

    $this->actingAs($this->user)
        ->post('/api/v1/athletes/import', ['file' => $csv, 'validate_only' => false])
        ->assertOk();

    expect(Athlete::query()->where('first_name', 'Mario')->sole()->joined_at?->toDateString())->toBe('2026-10-11');
});
