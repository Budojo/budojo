<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('returns all non-deleted documents for the given athlete', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory(3)->for($athlete)->create();
    Document::factory()->for($athlete)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure(['data', 'meta']);
});

it('orders documents newest created_at first', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $old = Document::factory()->for($athlete)->create(['created_at' => now()->subWeek()]);
    $new = Document::factory()->for($athlete)->create(['created_at' => now()]);

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertOk()
        ->assertJsonPath('data.0.id', $new->id)
        ->assertJsonPath('data.1.id', $old->id);
});

it('returns an empty list when the athlete has no documents', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

it('returns 401 on list without auth', function (): void {
    $athlete = Athlete::factory()->create();

    $this->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertUnauthorized();
});

it('returns 403 on list when athlete belongs to another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();
    Document::factory()->for($athlete)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertForbidden();
});

// ─── Cancelled visibility (P0.7b) ────────────────────────────────────────────

it('includes soft-deleted documents when ?trashed=1 is passed', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $active = Document::factory(2)->for($athlete)->create();
    $cancelled = Document::factory()->for($athlete)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents?trashed=1")
        ->assertOk()
        ->assertJsonCount(3, 'data');
});

it('exposes the deleted_at timestamp on tombstone rows', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $deletedAt = now()->subDays(3)->startOfDay();
    Document::factory()->for($athlete)->create(['deleted_at' => $deletedAt]);

    $response = $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents?trashed=1")
        ->assertOk()
        ->assertJsonCount(1, 'data');

    expect($response->json('data.0.deleted_at'))->not->toBeNull();
});

it('omits deleted_at (or sets it null) on active rows', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()->for($athlete)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents")
        ->assertOk()
        ->assertJsonPath('data.0.deleted_at', null);
});

it('orders soft-deleted and active documents together by newest first', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $old = Document::factory()->for($athlete)->create(['created_at' => now()->subWeek()]);
    $middle = Document::factory()->for($athlete)->create([
        'created_at' => now()->subDays(3),
        'deleted_at' => now()->subDay(),
    ]);
    $new = Document::factory()->for($athlete)->create(['created_at' => now()]);

    $response = $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}/documents?trashed=1")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toBe([$new->id, $middle->id, $old->id]);
});
