<?php

declare(strict_types=1);

namespace Tests\Feature\Authorization;

use App\Models\Academy;
use App\Models\User;

/**
 * Server-side role gate (#774, M7 epic #445 PR-F).
 *
 * Before this middleware landed, an authenticated athlete could `curl`
 * owner-only endpoints (notably `/api/v1/athletes`) and read the full
 * academy roster — every athlete's PII, payment status, document
 * expiry. The SPA gated those routes at the SPA layer; the server had
 * nothing. This file is the regression net: athletes hit owner-only
 * routes → 403 with the stable `role_required` body the SPA's
 * interceptor keys on.
 */

it('blocks athlete-role users from GET /athletes with 403 role_required', function (): void {
    $athlete = User::factory()->athlete()->create();

    $response = $this->actingAs($athlete)->getJson('/api/v1/athletes');

    $response->assertStatus(403);
    $response->assertExactJson(['message' => 'role_required']);
});

it('allows owner-role users on GET /athletes', function (): void {
    $owner = User::factory()->create();
    Academy::factory()->for($owner, 'owner')->create();

    $response = $this->actingAs($owner)->getJson('/api/v1/athletes');

    // Roster is empty (no Athletes::factory calls) but the 200 envelope
    // is what we care about — the gate let the owner through.
    $response->assertOk();
});

it('blocks athletes on the owner-only academy mutations', function (): void {
    $athlete = User::factory()->athlete()->create();

    $this->actingAs($athlete)->getJson('/api/v1/academy')
        ->assertStatus(403)
        ->assertExactJson(['message' => 'role_required']);

    $this->actingAs($athlete)->patchJson('/api/v1/academy', ['name' => 'x'])
        ->assertStatus(403);
});

it('blocks athletes on the owner-only attendance + stats surfaces', function (): void {
    $athlete = User::factory()->athlete()->create();

    $this->actingAs($athlete)->getJson('/api/v1/attendance')->assertStatus(403);
    $this->actingAs($athlete)->getJson('/api/v1/attendance/summary')->assertStatus(403);
    $this->actingAs($athlete)->getJson('/api/v1/stats/attendance/daily')->assertStatus(403);
});

it('keeps the role-agnostic /me/* surface open to athletes', function (): void {
    $athlete = User::factory()->athlete()->create();

    // /auth/me + /me/onboarding stay open — the role gate must not
    // accidentally block the athlete-portal surfaces (#618 / M7 PR-D).
    $this->actingAs($athlete)->getJson('/api/v1/auth/me')->assertOk();
});
