<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Support\BillingFloor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

function floorFor(?string $academyFrom, string $joinedAt): ?string
{
    $academy = Academy::factory()->create(['billing_from' => $academyFrom]);
    $athlete = Athlete::factory()->for($academy)->create(['joined_at' => $joinedAt]);

    return BillingFloor::isoFor($academy, $athlete->fresh());
}

it('floors on the academy when the athlete joined before it adopted budojo', function (): void {
    // Six seasons of amber "Non pagato" for months paid in cash years before
    // the app existed — the whole reason the column is there.
    expect(floorFor('2026-09-01', '2021-03-15'))->toBe('2026-09-01');
});

it('floors on the athlete when they joined after the academy adopted budojo', function (): void {
    expect(floorFor('2026-09-01', '2027-01-20'))->toBe('2027-01-01');
});

it('takes the later of the two on the month they share', function (): void {
    // Same month, different days: the rule is about months, so the day the
    // athlete happened to walk in must not tip the comparison either way.
    expect(floorFor('2026-09-01', '2026-09-28'))->toBe('2026-09-01');
});

it('falls back to the joining month when the academy has no floor', function (): void {
    // A restore from a backup predating #1742. It must behave exactly as the
    // ledger did before the column existed, not blank the athlete's history.
    expect(floorFor(null, '2021-03-15'))->toBe('2021-03-01');
});

it('pins the wire value to the first of the month, whatever day is stored', function (): void {
    expect(floorFor('2026-09-01', '2021-03-31'))->toBe('2026-09-01')
        ->and(floorFor(null, '2021-03-31'))->toBe('2021-03-01');
});

it('gives the same answer as a month index', function (): void {
    $academy = Academy::factory()->create(['billing_from' => '2026-09-01']);
    $athlete = Athlete::factory()->for($academy)->create(['joined_at' => '2021-03-15']);

    // The ledger compares absolute month indices; the wire carries a date.
    // Two shapes of one answer, and they must not be able to disagree.
    expect(BillingFloor::monthIndexFor($academy, $athlete->fresh()))->toBe(2026 * 12 + 8);
});

it('is exposed on the athlete resource, resolved rather than raw', function (): void {
    $user = userWithAcademy();
    $user->academy->update(['billing_from' => '2026-09-01']);
    $athlete = Athlete::factory()->for($user->academy)->create(['joined_at' => '2021-03-15']);

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}")
        ->assertOk()
        ->assertJsonStructure(['data' => ['billing_floor']])
        // The academy's month, not the athlete's — the client gets the
        // answer, not the two inputs to combine itself.
        ->assertJsonPath('data.billing_floor', '2026-09-01');
});

it('emits the academy setting raw so the form can put it back', function (): void {
    $user = userWithAcademy();
    $user->academy->update(['billing_from' => '2026-09-01']);

    $this->actingAs($user)
        ->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.billing_from', '2026-09-01');
});

it('pins a mid-month setting to the first when the owner saves it', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->patchJson('/api/v1/academy', ['billing_from' => '2026-09-17'])
        ->assertOk()
        // A floor set on the 17th must not behave differently from one set on
        // the 1st. Pinned once, on the way in, so no reader has to check.
        ->assertJsonPath('data.billing_from', '2026-09-01');
});

it('lets the owner clear the floor', function (): void {
    $user = userWithAcademy();
    $user->academy->update(['billing_from' => '2026-09-01']);

    $this->actingAs($user)
        ->patchJson('/api/v1/academy', ['billing_from' => null])
        ->assertOk()
        ->assertJsonPath('data.billing_from', null);
});

it('still records a payment for a month below the floor', function (): void {
    $user = userWithAcademy();
    $user->academy->update(['billing_from' => '2026-09-01', 'monthly_fee_cents' => 5000]);
    $athlete = Athlete::factory()->for($user->academy)->create(['joined_at' => '2021-03-15']);

    // The floor is a DISPLAY and aggregation rule, not a write rule. An owner
    // transcribing a paper register is exactly the case that produces a
    // payment below it, and refusing that write would be a different bug.
    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/payments", ['year' => 2023, 'month' => 4])
        ->assertCreated();
});

it('backfills existing academies to the month they were created in', function (): void {
    Carbon::setTestNow('2026-09-15 10:00:00');
    $academy = Academy::factory()->create(['created_at' => '2024-03-19 11:00:00']);
    \Illuminate\Support\Facades\DB::table('academies')
        ->where('id', $academy->id)
        ->update(['billing_from' => null]);

    migrationBillingFrom()->up();

    expect($academy->fresh()->billing_from?->toDateString())->toBe('2024-03-01');
    Carbon::setTestNow();
});

it('backfills in the same string shape eloquent writes', function (): void {
    $backfilled = Academy::factory()->create(['created_at' => '2024-03-19 11:00:00']);
    \Illuminate\Support\Facades\DB::table('academies')
        ->where('id', $backfilled->id)
        ->update(['billing_from' => null]);
    $saved = Academy::factory()->create();
    $saved->update(['billing_from' => '2024-03-01']);

    migrationBillingFrom()->up();

    $raw = fn (Academy $a): string => (string) \Illuminate\Support\Facades\DB::table('academies')
        ->where('id', $a->id)->value('billing_from');

    // `DB::table()` applies no casts. A bare `Y-m-d` beside a cast-written
    // `Y-m-d H:i:s` leaves two string shapes in one column, and SQLite
    // compares them as text — see .claude/gotchas.md.
    expect($raw($backfilled))->toBe($raw($saved));
});

it('does not overwrite a floor the owner has already set', function (): void {
    $academy = Academy::factory()->create(['created_at' => '2024-03-19 11:00:00']);
    $academy->update(['billing_from' => '2019-01-01']);

    migrationBillingFrom()->up();

    expect($academy->fresh()->billing_from?->toDateString())->toBe('2019-01-01');
});

function migrationBillingFrom(): object
{
    // The column already exists under RefreshDatabase, so `up()` exercises
    // only the data half — the half that can silently do nothing.
    return require database_path(
        'migrations/2026_09_15_130000_add_billing_from_to_academies_table.php',
    );
}
