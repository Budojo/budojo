<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\User;

beforeEach(function (): void {
    $this->verifiedUser = userWithAcademy();
    $this->unverifiedUser = User::factory()->unverified()->create();
    \App\Models\Academy::factory()->for($this->unverifiedUser, 'owner')->create();
    $this->unverifiedUser = $this->unverifiedUser->fresh();
});

// ── Reads stay open for unverified users ─────────────────────────────────────

it('allows GET /api/v1/athletes for an unverified user (reads are not gated)', function (): void {
    $this->actingAs($this->unverifiedUser)
        ->getJson('/api/v1/athletes')
        ->assertOk();
});

it('allows GET /api/v1/academy for an unverified user', function (): void {
    $this->actingAs($this->unverifiedUser)
        ->getJson('/api/v1/academy')
        ->assertOk();
});

it('allows GET /api/v1/auth/me for an unverified user (so the SPA can render the pillola)', function (): void {
    $this->actingAs($this->unverifiedUser)
        ->getJson('/api/v1/auth/me')
        ->assertOk();
});

// ── Writes are gated ─────────────────────────────────────────────────────────

it('rejects POST /api/v1/athletes for unverified users with 403 verification_required', function (): void {
    $this->actingAs($this->unverifiedUser)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'white',
            'stripes' => 0,
            'status' => 'active',
            'joined_at' => now()->toDateString(),
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'verification_required');
});

it('rejects PUT /api/v1/athletes/{id} for unverified users with 403', function (): void {
    $athlete = Athlete::factory()->for($this->unverifiedUser->academy, 'academy')->create();

    $this->actingAs($this->unverifiedUser)
        ->putJson("/api/v1/athletes/{$athlete->id}", [
            'first_name' => 'Renamed',
            'last_name' => 'Athlete',
            'belt' => 'blue',
            'stripes' => 1,
            'status' => 'active',
            'joined_at' => now()->toDateString(),
        ])
        ->assertStatus(403);
});

it('rejects DELETE /api/v1/athletes/{id} for unverified users with 403', function (): void {
    $athlete = Athlete::factory()->for($this->unverifiedUser->academy, 'academy')->create();

    $this->actingAs($this->unverifiedUser)
        ->deleteJson("/api/v1/athletes/{$athlete->id}")
        ->assertStatus(403);
});

it('rejects POST /api/v1/athletes/{id}/documents for unverified users with 403', function (): void {
    $athlete = Athlete::factory()->for($this->unverifiedUser->academy, 'academy')->create();

    $this->actingAs($this->unverifiedUser)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'medical_certificate',
            'expires_at' => now()->addYear()->toDateString(),
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'verification_required');
});

it('rejects PUT /api/v1/documents/{id} for unverified users with 403', function (): void {
    $athlete = Athlete::factory()->for($this->unverifiedUser->academy, 'academy')->create();
    $document = \App\Models\Document::factory()->for($athlete, 'athlete')->create();

    $this->actingAs($this->unverifiedUser)
        ->putJson("/api/v1/documents/{$document->id}", [
            'type' => $document->type->value,
            'expires_at' => now()->addYear()->toDateString(),
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'verification_required');
});

it('rejects DELETE /api/v1/documents/{id} for unverified users with 403', function (): void {
    $athlete = Athlete::factory()->for($this->unverifiedUser->academy, 'academy')->create();
    $document = \App\Models\Document::factory()->for($athlete, 'athlete')->create();

    $this->actingAs($this->unverifiedUser)
        ->deleteJson("/api/v1/documents/{$document->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'verification_required');
});

// ── Verified users still pass through ────────────────────────────────────────

it('allows POST /api/v1/athletes for a verified user', function (): void {
    $this->actingAs($this->verifiedUser)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'white',
            'stripes' => 0,
            'status' => 'active',
            'joined_at' => now()->toDateString(),
        ])
        ->assertCreated();
});
