<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademyClosure;
use App\Models\AcademyMembership;
use App\Models\User;

/**
 * #1766 — the days the academy is shut. Whole days, inclusive ranges; they
 * only ever take days out of the scheduled ones.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->user->academy;
    $this->academy = $academy;
});

it('records a closure, lists it and sends it with the academy', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/closures', ['starts_on' => '2026-08-10', 'ends_on' => '2026-08-25', 'label' => 'Chiusura estiva'])
        ->assertCreated()
        ->assertJsonPath('data.starts_on', '2026-08-10')
        ->assertJsonPath('data.ends_on', '2026-08-25')
        ->assertJsonPath('data.label', 'Chiusura estiva');

    $this->actingAs($this->user)->getJson('/api/v1/academy/closures')
        ->assertOk()
        ->assertJsonCount(1, 'data');
    $this->actingAs($this->user)->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.closures.0.starts_on', '2026-08-10')
        ->assertJsonPath('data.closures.0.ends_on', '2026-08-25');
});

it('lists closures in date order, overlapping ones included', function (): void {
    $this->academy->closures()->create(['starts_on' => '2026-12-24', 'ends_on' => '2027-01-06']);
    $this->academy->closures()->create(['starts_on' => '2026-08-10', 'ends_on' => '2026-08-25']);
    $this->academy->closures()->create(['starts_on' => '2026-08-15', 'ends_on' => '2026-08-15', 'label' => 'Ferragosto']);

    $starts = collect($this->actingAs($this->user)->getJson('/api/v1/academy/closures')->assertOk()->json('data'))->pluck('starts_on')->all();

    expect($starts)->toBe(['2026-08-10', '2026-08-15', '2026-12-24']);
});

it('takes a single day as a closure that starts and ends on it', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/closures', ['starts_on' => '2026-11-01', 'ends_on' => '2026-11-01'])
        ->assertCreated()
        ->assertJsonPath('data.label', null);
});

it('refuses a closure that ends before it starts, or with no dates', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/closures', ['starts_on' => '2026-08-25', 'ends_on' => '2026-08-10'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['ends_on']);
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/closures', ['label' => 'Chiuso'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['starts_on', 'ends_on']);
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/closures', ['starts_on' => '2026-08-10', 'ends_on' => '2026-08-11', 'label' => str_repeat('x', 81)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['label']);
});

it('edits and deletes a closure', function (): void {
    $closure = $this->academy->closures()->create(['starts_on' => '2026-08-10', 'ends_on' => '2026-08-25']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/closures/{$closure->id}", ['starts_on' => '2026-08-08', 'ends_on' => '2026-08-30', 'label' => 'Estate'])
        ->assertOk()
        ->assertJsonPath('data.starts_on', '2026-08-08')
        ->assertJsonPath('data.label', 'Estate');

    $this->actingAs($this->user)->deleteJson("/api/v1/academy/closures/{$closure->id}")->assertNoContent();

    expect(AcademyClosure::query()->count())->toBe(0);
});

it('keeps another academy\'s closures out of reach', function (): void {
    $foreign = userWithAcademy()->academy->closures()->create(['starts_on' => '2026-08-10', 'ends_on' => '2026-08-25']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/closures/{$foreign->id}", ['starts_on' => '2026-08-01', 'ends_on' => '2026-08-02'])
        ->assertForbidden();
    $this->actingAs($this->user)->deleteJson("/api/v1/academy/closures/{$foreign->id}")->assertForbidden();
    $this->actingAs($this->user)->getJson('/api/v1/academy/closures')->assertOk()->assertJsonCount(0, 'data');

    expect($foreign->fresh()?->starts_on)->toBe('2026-08-10');
});

it('lets any member read the closures but only settings-holders write them', function (
    string $role,
    bool $mayWrite,
): void {
    $academy = Academy::factory()->create();
    $member = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($member)->for($academy)->create(['role' => $role]);

    $this->actingAs($member)->getJson('/api/v1/academy/closures')->assertOk();

    $write = $this->actingAs($member)->postJson('/api/v1/academy/closures', ['starts_on' => '2026-08-10', 'ends_on' => '2026-08-25']);

    $mayWrite ? $write->assertCreated() : $write->assertForbidden();
})->with([
    'owner' => ['owner', true],
    'admin' => ['admin', true],
    'instructor' => ['instructor', false],
    'assistant' => ['assistant', false],
]);
