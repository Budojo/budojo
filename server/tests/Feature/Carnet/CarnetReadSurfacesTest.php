<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\Carnet;
use App\Models\CarnetEntry;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

// ─── GET /athletes/{athlete}/carnets/{carnet}/entries ─────────────────────────

it('lists the sessions a carnet paid for, most recent first', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create();
    CarnetEntry::factory()->for($carnet)->create(['used_on' => '2026-03-01']);
    CarnetEntry::factory()->for($carnet)->create(['used_on' => '2026-03-09']);

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}/entries")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.used_on', '2026-03-09')
        ->assertJsonPath('data.1.used_on', '2026-03-01');
});

it('refuses to read a register through an athlete the carnet does not belong to', function (): void {
    $other = Athlete::factory()->for($this->user->academy)->create();
    $carnet = Carnet::factory()->for($other)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}/entries")
        ->assertForbidden();
});

it('forbids reading a register across academies', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create();
    $outsider = userWithAcademy();

    $this->actingAs($outsider)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}/entries")
        ->assertForbidden();
});

// ─── is_active on the carnet resource ─────────────────────────────────────────

it('reports a carnet inside its window with entries left as active', function (): void {
    Carnet::factory()->for($this->athlete)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonPath('data.0.is_active', true);
});

it('reports an exhausted carnet as inactive even inside its window', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create(['total_entries' => 1]);
    CarnetEntry::factory()->for($carnet)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonPath('data.0.remaining_entries', 0)
        ->assertJsonPath('data.0.is_active', false);
});

it('reports an expired carnet as inactive', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn(now()->subMonths(18)->toDateString())->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonPath('data.0.is_active', false);
});

// ─── active_carnet on the athlete resource ────────────────────────────────────

it('exposes the active carnet on the athlete list without an extra call', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create(['total_entries' => 10]);
    CarnetEntry::factory()->count(3)->for($carnet)->create();

    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.active_carnet.code', $carnet->code)
        ->assertJsonPath('data.0.active_carnet.remaining_entries', 7);
});

it('exposes the active carnet on the single-athlete endpoint too', function (): void {
    Carnet::factory()->for($this->athlete)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.active_carnet.remaining_entries', 10);
});

it('reports a null active carnet when the athlete holds none that is spendable', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn(now()->subMonths(18)->toDateString())->create();

    $this->actingAs($this->user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonPath('data.0.active_carnet', null);
});

// ─── GET /me/carnets ──────────────────────────────────────────────────────────

it('lets an athlete read their own carnet balance', function (): void {
    $athleteUser = \App\Models\User::factory()->create();
    $this->athlete->update(['user_id' => $athleteUser->id]);
    Carnet::factory()->for($this->athlete)->create();

    $this->actingAs($athleteUser)
        ->getJson('/api/v1/me/carnets')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.remaining_entries', 10);
});

it('returns 404 on /me/carnets for a user with no athlete profile', function (): void {
    $this->actingAs($this->user)
        ->getJson('/api/v1/me/carnets')
        ->assertNotFound();
});
