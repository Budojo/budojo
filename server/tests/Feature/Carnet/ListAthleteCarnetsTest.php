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

// ─── GET /athletes/{id}/carnets ───────────────────────────────────────────────

it('returns an empty collection for an athlete with no carnets', function (): void {
    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('lists the carnets newest purchase first', function (): void {
    Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
    Carnet::factory()->for($this->athlete)->purchasedOn('2026-06-20')->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.purchased_at', '2026-06-20')
        ->assertJsonPath('data.1.purchased_at', '2026-01-10');
});

it('derives the residual balance from the entry ledger', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create(['total_entries' => 10]);
    CarnetEntry::factory()->count(3)->for($carnet)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonPath('data.0.total_entries', 10)
        ->assertJsonPath('data.0.remaining_entries', 7);
});

it('does not leak carnets of other athletes', function (): void {
    $other = Athlete::factory()->for($this->user->academy)->create();
    Carnet::factory()->for($other)->create();

    $this->actingAs($this->user)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('forbids reading the carnets of an athlete in another academy', function (): void {
    $outsider = userWithAcademy();

    $this->actingAs($outsider)
        ->getJson("/api/v1/athletes/{$this->athlete->id}/carnets")
        ->assertForbidden();
});
