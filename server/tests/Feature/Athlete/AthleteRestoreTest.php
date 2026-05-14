<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;

/**
 * Restore-athlete flow (#700). Partial-undo policy: the athlete row
 * + their payment / attendance / promotion history come back, but
 * documents stay gone (file already wiped on delete per the M3 PRD).
 */

it('restores a soft-deleted athlete', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/restore")
        ->assertOk()
        ->assertJsonPath('data.id', $athlete->id);

    expect(Athlete::find($athlete->id))->not->toBeNull();
    expect($athlete->fresh()->deleted_at)->toBeNull();
});

it('returns 403 when restoring an athlete from another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/restore")
        ->assertForbidden();

    // Row stays trashed — the unauthorised request must not have touched it.
    expect(Athlete::withTrashed()->find($athlete->id)?->deleted_at)->not->toBeNull();
});

it('returns 404 when restoring an athlete that is not soft-deleted', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/restore")
        ->assertNotFound();
});

it('GET /athletes?status=trashed returns only soft-deleted athletes', function (): void {
    $user = userWithAcademy();
    Athlete::factory(2)->for($user->academy)->create();
    $trashed = Athlete::factory()->for($user->academy)->create(['deleted_at' => now()]);

    $response = $this->actingAs($user)->getJson('/api/v1/athletes?status=trashed');

    $response->assertOk()->assertJsonCount(1, 'data');
    expect($response->json('data.0.id'))->toBe($trashed->id);
});

it('GET /athletes?status=trashed does not leak across academies', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    Athlete::factory()->for($user->academy)->create(['deleted_at' => now()]);
    Athlete::factory()->for($otherAcademy)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->getJson('/api/v1/athletes?status=trashed')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});
