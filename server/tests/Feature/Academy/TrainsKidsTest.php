<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;

// helpers live in tests/Pest.php

/**
 * Whether the academy trains kids (#1651).
 *
 * An academy with no kids' programme skipped four youth belts on every belt
 * pick. The flag is a statement about the academy that the SPA reads to trim
 * its pickers and filters; it is **not** a rule the server enforces — an
 * athlete already on a youth belt keeps it, and an import or a backfill that
 * names one is still valid.
 */
beforeEach(function (): void {
    $this->travelTo('2026-09-24 10:00:00');
});

it('starts off on a new academy', function (): void {
    // Setup asks for the name and the martial art and nothing else; an owner
    // who trains kids says so once on the academy page.
    $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/academy', ['name' => 'Dojo', 'martial_art' => 'bjj'])
        ->assertCreated()
        ->assertJsonPath('data.trains_kids', false);
});

it('is changed from the academy page', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->patchJson('/api/v1/academy', ['trains_kids' => true])
        ->assertOk()
        ->assertJsonPath('data.trains_kids', true);

    $this->actingAs($user)
        ->patchJson('/api/v1/academy', ['trains_kids' => false])
        ->assertOk()
        ->assertJsonPath('data.trains_kids', false);
});

it('refuses a value that is not a yes or a no', function (): void {
    $this->actingAs(userWithAcademy())
        ->patchJson('/api/v1/academy', ['trains_kids' => 'sometimes'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('trains_kids');
});

it('still takes a youth belt when the academy does not train kids', function (): void {
    // The flag trims what the SPA offers; it is not a rule. An adult academy
    // that takes in a teenager already holding a green belt records it.
    $user = userWithAcademy();
    $user->academy->update(['trains_kids' => false]);

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Luca', 'last_name' => 'Verdi', 'belt' => 'green', 'stripes' => 0,
            'status' => 'active', 'joined_at' => '2026-09-01',
        ])
        ->assertCreated();
});

// ─── Existing academies ──────────────────────────────────────────────────────

function trainsKidsMigration(): object
{
    return require database_path('migrations/2026_09_24_120000_add_trains_kids_to_academies_table.php');
}

it('answers from what each academy already holds', function (): void {
    // Derived, not defaulted: an academy with a kid on the roster keeps every
    // belt it had, and an adults-only one loses the four it never used.
    $adults = Academy::factory()->create();
    Athlete::factory()->for($adults)->create(['belt' => Belt::Blue, 'date_of_birth' => '1990-05-01']);

    $youthBelt = Academy::factory()->create();
    Athlete::factory()->for($youthBelt)->create(['belt' => Belt::Grey, 'date_of_birth' => null]);

    // Twelve this year, still on white: a kid by age, not yet by belt.
    $youngOnWhite = Academy::factory()->create();
    Athlete::factory()->for($youngOnWhite)->create(['belt' => Belt::White, 'date_of_birth' => '2014-11-20']);

    // A judo half belt is a kids' step in that ladder (#1801).
    $judo = Academy::factory()->create(['martial_art' => MartialArt::Judo]);
    Athlete::factory()->for($judo)->create(['belt' => Belt::WhiteAndYellow, 'date_of_birth' => null]);

    $empty = Academy::factory()->create();
    Academy::query()->update(['trains_kids' => false]);

    trainsKidsMigration()->up();

    expect($adults->fresh()->trains_kids)->toBeFalse()
        ->and($youthBelt->fresh()->trains_kids)->toBeTrue()
        ->and($youngOnWhite->fresh()->trains_kids)->toBeTrue()
        ->and($judo->fresh()->trains_kids)->toBeTrue()
        ->and($empty->fresh()->trains_kids)->toBeFalse();
});

it("draws the age line where the art's kids' divisions end", function (): void {
    // BJJ's youngest adult division (juvenile) starts at 16: turning 15 this
    // year is a kid, turning 16 is not. Pinned on both sides, because an
    // off-by-one here moves every teenager across it.
    $fifteen = Academy::factory()->create();
    Athlete::factory()->for($fifteen)->create(['belt' => Belt::White, 'date_of_birth' => '2011-12-31']);
    $sixteen = Academy::factory()->create();
    Athlete::factory()->for($sixteen)->create(['belt' => Belt::White, 'date_of_birth' => '2010-01-01']);
    Academy::query()->update(['trains_kids' => false]);

    trainsKidsMigration()->up();

    expect($fifteen->fresh()->trains_kids)->toBeTrue()
        ->and($sixteen->fresh()->trains_kids)->toBeFalse();
});

it('counts a soft-deleted kid, and ignores another academy', function (): void {
    // Restoring the kid would bring back a youth belt the pickers no longer
    // offer; and a kid next door says nothing about this academy.
    $restorable = Academy::factory()->create();
    Athlete::factory()->for($restorable)->create(['belt' => Belt::Yellow, 'deleted_at' => now()]);
    $next = Academy::factory()->create();
    Athlete::factory()->for($next)->create(['belt' => Belt::Blue, 'date_of_birth' => '1985-01-01']);
    Academy::query()->update(['trains_kids' => false]);

    trainsKidsMigration()->up();

    expect($restorable->fresh()->trains_kids)->toBeTrue()
        ->and($next->fresh()->trains_kids)->toBeFalse();
});
