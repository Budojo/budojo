<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\Carnet;
use App\Models\CarnetEntry;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->user->academy->update(['carnet_price_cents' => 7000, 'carnet_entries' => 10]);
    $this->athlete = Athlete::factory()->for($this->user->academy)->create();
});

function markDay(int $athleteId, string $day): void
{
    \App\Models\AttendanceRecord::create(['athlete_id' => $athleteId, 'attended_on' => $day]);
}

/**
 * Factories write rows, they do not run the actions that keep the ledger in
 * step — in production that is `SellCarnetAction`'s job. Seeding a fixture
 * therefore has to reconcile explicitly, exactly as the real path does.
 */
function reconcile(int $athleteId): void
{
    app(\App\Actions\Payment\ReconcileCarnetEntriesAction::class)->execute([$athleteId]);
}

// ─── Selling with a back-dated validity ───────────────────────────────────────

it('sells a carnet whose validity starts before the sale', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-09-04',
            'valid_from' => '2026-06-01',
        ])
        ->assertCreated()
        ->assertJsonPath('data.purchased_at', '2026-09-04')
        ->assertJsonPath('data.valid_from', '2026-06-01')
        // The window is twelve months from validity, not from the sale.
        ->assertJsonPath('data.expires_at', '2027-06-01');
});

it('defaults the validity to the sale date when none is given', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", ['purchased_at' => '2026-09-04'])
        ->assertCreated()
        ->assertJsonPath('data.valid_from', '2026-09-04')
        ->assertJsonPath('data.expires_at', '2027-09-04');
});

it('counts sessions already on the register when the carnet is dated to cover them', function (): void {
    // The owner's exact report: presences on the 2nd and the 4th, a carnet sold
    // on the 4th. Under the old model only the 4th counted.
    markDay($this->athlete->id, '2026-09-02');
    markDay($this->athlete->id, '2026-09-04');

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'purchased_at' => '2026-09-04',
            'valid_from' => '2026-09-01',
        ])
        ->assertCreated()
        ->assertJsonPath('data.remaining_entries', 8);
});

it('refuses a validity date in the future', function (): void {
    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/carnets", [
            'valid_from' => now()->addDay()->toDateString(),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['valid_from']);
});

// ─── Re-dating an existing carnet ─────────────────────────────────────────────

it('claims earlier sessions when the validity is pulled back', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-06-01')->create();
    expect(CarnetEntry::count())->toBe(0);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}", [
            'valid_from' => '2026-05-01',
        ])
        ->assertOk()
        ->assertJsonPath('data.valid_from', '2026-05-01')
        ->assertJsonPath('data.remaining_entries', 9);

    expect(CarnetEntry::count())->toBe(1);
});

it('releases sessions when the validity is pushed forward', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-05-01')->create();
    reconcile($this->athlete->id);
    expect(CarnetEntry::count())->toBe(1);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}", [
            'valid_from' => '2026-06-01',
        ])
        ->assertOk()
        ->assertJsonPath('data.remaining_entries', 10);

    expect(CarnetEntry::count())->toBe(0);
});

it('moves the expiry with the validity, so re-dating spends life rather than adding it', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-09-01')->create();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}", [
            'valid_from' => '2026-03-01',
        ])
        ->assertOk()
        ->assertJsonPath('expires_at', null) // not at the root
        ->assertJsonPath('data.expires_at', '2027-03-01');
});

it('refuses to re-date a carnet through an athlete it does not belong to', function (): void {
    $other = Athlete::factory()->for($this->user->academy)->create();
    $carnet = Carnet::factory()->for($other)->create();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}", [
            'valid_from' => '2026-01-01',
        ])
        ->assertForbidden();
});

// ─── Deleting a mis-sold carnet ───────────────────────────────────────────────

it('deletes a carnet and leaves the sessions on the register, uncovered', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    $carnet = Carnet::factory()->for($this->athlete)->validFrom('2026-05-01')->create();
    reconcile($this->athlete->id);
    expect(CarnetEntry::count())->toBe(1);

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}")
        ->assertNoContent();

    expect(Carnet::count())->toBe(0)
        ->and(CarnetEntry::count())->toBe(0)
        // Attendance is a register of what happened; deleting a payment does
        // not un-happen the training.
        ->and($this->athlete->attendanceRecords()->count())->toBe(1);
});

it('hands the sessions to another carnet that covers them, rather than dropping them', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    // Expiry derives from validity now, so the earlier-starting carnet is also
    // the earlier-expiring one — and FIFO gives it the session first.
    $doomed = Carnet::factory()->for($this->athlete)->validFrom('2026-04-01')->create();
    $survivor = Carnet::factory()->for($this->athlete)->validFrom('2026-05-01')->create();
    reconcile($this->athlete->id);

    expect(CarnetEntry::where('carnet_id', $doomed->id)->count())->toBe(1);

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$doomed->id}")
        ->assertNoContent();

    expect(CarnetEntry::where('carnet_id', $survivor->id)->count())->toBe(1);
});

it('refuses to delete a carnet through an athlete it does not belong to', function (): void {
    $other = Athlete::factory()->for($this->user->academy)->create();
    $carnet = Carnet::factory()->for($other)->create();

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}")
        ->assertForbidden();

    expect(Carnet::count())->toBe(1);
});

it('forbids deleting across academies', function (): void {
    $carnet = Carnet::factory()->for($this->athlete)->create();
    $outsider = userWithAcademy();

    $this->actingAs($outsider)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/carnets/{$carnet->id}")
        ->assertForbidden();
});

// ─── The monthly fee still wins, and now says so retroactively ────────────────

it('releases a month to the monthly fee when it is paid after the fact', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    Carnet::factory()->for($this->athlete)->validFrom('2026-05-01')->create();
    $this->user->academy->update(['monthly_fee_cents' => 5000]);
    reconcile($this->athlete->id);
    expect(CarnetEntry::count())->toBe(1);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", ['year' => 2026, 'month' => 5])
        ->assertCreated();

    // Under the event-driven model this stayed charged on purpose. With the
    // balance derived from its inputs, paying the month gives the entry back.
    expect(CarnetEntry::count())->toBe(0);
});

it('charges the carnet again when the monthly payment is undone', function (): void {
    markDay($this->athlete->id, '2026-05-10');
    Carnet::factory()->for($this->athlete)->validFrom('2026-05-01')->create();
    $this->user->academy->update(['monthly_fee_cents' => 5000]);
    reconcile($this->athlete->id);

    $this->actingAs($this->user)
        ->postJson("/api/v1/athletes/{$this->athlete->id}/payments", ['year' => 2026, 'month' => 5]);
    expect(CarnetEntry::count())->toBe(0);

    $this->actingAs($this->user)
        ->deleteJson("/api/v1/athletes/{$this->athlete->id}/payments/2026/5")
        ->assertNoContent();

    expect(CarnetEntry::count())->toBe(1);
});
