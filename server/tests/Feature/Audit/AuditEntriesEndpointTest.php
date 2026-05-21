<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AuditEntry;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    AuditEntry::query()->delete();
});

// ─── Happy path ─────────────────────────────────────────────────────

it('returns the academy\'s audit entries paginated, newest first', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    // Three athletes → three athlete.created rows in the audit log.
    Athlete::factory()->for($owner->academy)->create();
    Athlete::factory()->for($owner->academy)->create();
    Athlete::factory()->for($owner->academy)->create();

    $response = $this->getJson('/api/v1/audit-entries')->assertOk();
    $response->assertJsonStructure(['data' => [['id', 'action', 'actor_label', 'created_at']]]);
    expect(count($response->json('data')))->toBe(3);
    expect($response->json('meta.total'))->toBe(3);
});

it('paginates at per_page (default 20)', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    Athlete::factory()->count(25)->for($owner->academy)->create();

    $page1 = $this->getJson('/api/v1/audit-entries')->assertOk();
    expect(count($page1->json('data')))->toBe(20);
    expect($page1->json('meta.last_page'))->toBe(2);

    $page2 = $this->getJson('/api/v1/audit-entries?page=2')->assertOk();
    expect(count($page2->json('data')))->toBe(5);
});

it('honours per_page when supplied within the [1,100] bound', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    Athlete::factory()->count(15)->for($owner->academy)->create();

    $response = $this->getJson('/api/v1/audit-entries?per_page=10')->assertOk();
    expect(count($response->json('data')))->toBe(10);
});

// ─── Filters ────────────────────────────────────────────────────────

it('filters by action verb', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    $mario = Athlete::factory()->for($owner->academy)->create(['belt' => 'blue']);

    // Generate a mix: belt-promoted + a generic update.
    AuditEntry::query()->delete();
    $mario->belt = 'purple';
    $mario->save();
    $mario->first_name = 'Mario II';
    $mario->save();

    $response = $this->getJson('/api/v1/audit-entries?action=athlete.belt.promoted')->assertOk();
    expect(count($response->json('data')))->toBe(1);
    expect($response->json('data.0.action'))->toBe('athlete.belt.promoted');
});

it('filters by actor_user_id', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    Athlete::factory()->for($owner->academy)->create(); // actor=$owner

    // Write a system-actor entry (no acting user) directly via the action.
    app(\App\Actions\Audit\WriteAuditEntry::class)->execute(
        action: 'audit.pruned',
        academy: $owner->academy,
    );

    $response = $this->getJson("/api/v1/audit-entries?actor_user_id={$owner->id}")->assertOk();
    expect(count($response->json('data')))->toBe(1);
    expect($response->json('data.0.actor_user_id'))->toBe($owner->id);
});

it('filters by from/to date range (inclusive end-of-day)', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    \Carbon\Carbon::setTestNow('2026-05-19 12:00:00');
    Athlete::factory()->for($owner->academy)->create();
    \Carbon\Carbon::setTestNow('2026-05-20 12:00:00');
    Athlete::factory()->for($owner->academy)->create();
    \Carbon\Carbon::setTestNow('2026-05-21 23:50:00');
    Athlete::factory()->for($owner->academy)->create();
    \Carbon\Carbon::setTestNow();

    $response = $this->getJson('/api/v1/audit-entries?from=2026-05-20&to=2026-05-21')->assertOk();
    expect(count($response->json('data')))->toBe(2);
});

it('filters by subject (type + id) to scope to a single entity\'s history', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);
    $mario = Athlete::factory()->for($owner->academy)->create();
    $luigi = Athlete::factory()->for($owner->academy)->create();

    $response = $this->getJson(
        '/api/v1/audit-entries?subject_type=' . urlencode(Athlete::class) . "&subject_id={$mario->id}",
    )->assertOk();
    expect(count($response->json('data')))->toBe(1);
    expect($response->json('data.0.subject_id'))->toBe($mario->id);
});

// ─── Academy scoping ────────────────────────────────────────────────

it('only returns entries from the authenticated user\'s academy', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();

    Sanctum::actingAs($ownerA);
    Athlete::factory()->for($ownerA->academy)->create();

    Sanctum::actingAs($ownerB);
    Athlete::factory()->for($ownerB->academy)->create();
    Athlete::factory()->for($ownerB->academy)->create();

    Sanctum::actingAs($ownerA);
    $response = $this->getJson('/api/v1/audit-entries')->assertOk();
    expect(count($response->json('data')))->toBe(1);
});

// ─── Role gate ──────────────────────────────────────────────────────

it('returns 403 for athlete-role users', function (): void {
    $athleteUser = \App\Models\User::factory()->create([
        'role' => \App\Enums\UserRole::Athlete,
    ]);
    Sanctum::actingAs($athleteUser);

    // Caught by the `role:owner` middleware that wraps the route group;
    // FormRequest's authorize() is defense-in-depth behind it.
    $this->getJson('/api/v1/audit-entries')->assertForbidden();
});

// ─── Validation ─────────────────────────────────────────────────────

it('rejects unsupported per_page values with 422', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $this->getJson('/api/v1/audit-entries?per_page=999')->assertStatus(422);
    $this->getJson('/api/v1/audit-entries?per_page=0')->assertStatus(422);
});

it('rejects unsupported page values with 422', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $this->getJson('/api/v1/audit-entries?page=0')->assertStatus(422);
    $this->getJson('/api/v1/audit-entries?page=-1')->assertStatus(422);
});

it('rejects malformed date filters with 422', function (): void {
    $owner = userWithAcademy();
    Sanctum::actingAs($owner);

    $this->getJson('/api/v1/audit-entries?from=not-a-date')->assertStatus(422);
});
