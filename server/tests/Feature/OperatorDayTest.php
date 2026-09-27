<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\Carnet;
use App\Models\User;
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
        ->assertJsonPath('data.purchased_at', '2026-10-11')
        // …and it is spendable today. Read against UTC's day it was not yet
        // valid, so the pack just sold showed inactive until 02:00.
        ->assertJsonPath('data.is_active', true);
});

it('shows a carnet sold after midnight as paying for the month, on the roster and in the search', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [])
        ->assertCreated();

    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.payment_coverage', 'carnet')
        ->assertJsonPath('data.0.active_carnet.remaining_entries', 10);

    $unpaid = $this->actingAs($this->user)->getJson('/api/v1/athletes?paid=no')->assertOk()->json('data');
    expect($unpaid)->toBe([]);

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.payment_coverage', 'carnet');
});

it('counts time at the belt from the operator\'s today, never below zero', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/promotions", [
            'kind' => 'belt', 'from_belt' => 'white', 'to_belt' => 'blue', 'recorded_at' => '2026-10-11',
        ])
        ->assertCreated();

    // Promoted today: zero days and zero months. Against UTC's 10th it was
    // -1 of each, and the template printed "-1 mesi".
    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/promotions")
        ->assertOk()
        ->assertJsonPath('progression.belt_since', '2026-10-11')
        ->assertJsonPath('progression.days_at_belt', 0)
        ->assertJsonPath('progression.months_at_belt', 0);
});

it('starts a new academy\'s billing and schedule on the operator\'s day', function (): void {
    // 00:30 on 1 October in Rome, still 30 September in UTC: an academy
    // created now starts billing in October. September would be the phantom
    // month #1742 exists to remove.
    $this->travelTo('2026-09-30 22:30:00');

    $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/academy', ['name' => 'Dojo', 'martial_art' => 'bjj', 'training_days' => [1, 3, 5]])
        ->assertCreated()
        ->assertJsonPath('data.billing_from', '2026-10-01')
        ->assertJsonPath('data.current_schedule.effective_from', '2026-10-01');
});

it('dates a training-days change to the operator\'s today, and keeps it current', function (): void {
    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['training_days' => [2, 4]])
        ->assertOk()
        ->assertJsonPath('data.current_schedule.effective_from', '2026-10-11')
        ->assertJsonPath('data.current_schedule.training_days', [2, 4]);
});

it('schedules a change from the operator\'s tomorrow, and not from today', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/schedules', ['training_days' => [1], 'effective_from' => '2026-10-11'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('effective_from');

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/schedules', ['training_days' => [1], 'effective_from' => '2026-10-12'])
        ->assertCreated();
});

it('names the season the operator is in, the same one its start date names', function (): void {
    // 00:30 on 1 September in Rome: the new season has begun for the owner,
    // while UTC is still in August — in last season.
    $this->travelTo('2026-08-31 22:30:00');
    $this->user->academy->update(['season_start_month' => 9]);

    $this->actingAs($this->user)
        ->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.season_start', '2026-09-01')
        ->assertJsonPath('data.season_label', '2026/27');
});

it('dates a belt given after midnight to the operator\'s day, and counts from it', function (): void {
    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$this->athlete->id}", ['belt' => 'purple', 'stripes' => 0])
        ->assertOk();

    $rows = $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/promotions")
        ->assertOk();

    expect(collect($rows->json('data'))->firstWhere('to_belt', 'purple')['recorded_at'])->toStartWith('2026-10-11')
        ->and($rows->json('progression.belt_since'))->toBe('2026-10-11')
        ->and($rows->json('progression.days_at_belt'))->toBe(0);
});

it('opens a new athlete\'s timeline on the operator\'s day', function (): void {
    $id = $this->actingAs($this->user)
        ->postJson('/api/v1/athletes', ['first_name' => 'Luca', 'last_name' => 'Bianchi', 'belt' => 'white', 'status' => 'active', 'joined_at' => '2026-10-11'])
        ->assertCreated()
        ->json('data.id');

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$id}/promotions")
        ->assertOk()
        ->assertJsonPath('data.0.recorded_at', fn (string $at): bool => str_starts_with($at, '2026-10-11'))
        ->assertJsonPath('progression.belt_since', '2026-10-11');
});

it('refuses a birth date of the operator\'s today', function (): void {
    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$this->athlete->id}", ['date_of_birth' => '2026-10-11'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('date_of_birth');

    $this->actingAs($this->user)
        ->putJson("/api/v1/athletes/{$this->athlete->id}", ['date_of_birth' => '2026-10-10'])
        ->assertOk();
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
