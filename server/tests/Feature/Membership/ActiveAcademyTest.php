<?php

declare(strict_types=1);

use App\Authorization\Capability;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\User;

/**
 * (#427 / #428 / #718) Covers `User::canInAcademy()` plus the two
 * `/me/active-academy` HTTP endpoints. Together these are the
 * authorization surface every FormRequest will lean on in
 * sub-issue 4/9.
 */

it('canInAcademy() returns true for an active member whose role grants the capability', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->admin()->create();

    expect($user->canInAcademy($academy->id, Capability::AthletesCreateUpdate))->toBeTrue();
    expect($user->canInAcademy($academy->id, Capability::TeamInvite))->toBeTrue();
});

it('canInAcademy() returns false when the user is not a member', function (): void {
    $user = User::factory()->create();
    $strangerAcademy = Academy::factory()->create();

    expect($user->canInAcademy($strangerAcademy->id, Capability::AthletesRead))->toBeFalse();
});

it('canInAcademy() returns false when the membership is soft-revoked', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->admin()->revoked()->create();

    expect($user->canInAcademy($academy->id, Capability::AthletesRead))->toBeFalse();
});

it('canInAcademy() returns false when the role does not grant the capability', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->assistant()->create();

    // Assistants can't update athletes or change team roles.
    expect($user->canInAcademy($academy->id, Capability::AthletesCreateUpdate))->toBeFalse();
    expect($user->canInAcademy($academy->id, Capability::TeamChangeRole))->toBeFalse();
    // But they CAN read.
    expect($user->canInAcademy($academy->id, Capability::AthletesRead))->toBeTrue();
});

it('GET /me/active-academy returns the academy + role + capabilities list', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->instructor()->create();
    $user->update(['active_academy_id' => $academy->id]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/active-academy');

    $response->assertOk()
        ->assertJsonPath('data.academy.id', $academy->id)
        ->assertJsonPath('data.role', 'instructor');

    /** @var array<int, string> $capabilities */
    $capabilities = $response->json('data.capabilities') ?? [];
    expect($capabilities)->toContain('athletes_create_update');
    expect($capabilities)->toContain('attendance_record');
    expect($capabilities)->not->toContain('athletes_delete'); // instructor can't delete
});

it('GET /me/active-academy returns 204 when the user has no active membership', function (): void {
    $user = User::factory()->create(['active_academy_id' => null]);

    $this->actingAs($user)
        ->getJson('/api/v1/me/active-academy')
        ->assertNoContent();
});

it('PATCH /me/active-academy switches to an academy the user belongs to', function (): void {
    $user = User::factory()->create();
    $academyA = Academy::factory()->create();
    $academyB = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academyA)->owner()->create();
    AcademyMembership::factory()->for($user)->for($academyB)->instructor()->create();
    $user->update(['active_academy_id' => $academyA->id]);

    $response = $this->actingAs($user)
        ->patchJson('/api/v1/me/active-academy', ['academy_id' => $academyB->id]);

    $response->assertOk()
        ->assertJsonPath('data.academy.id', $academyB->id)
        ->assertJsonPath('data.role', 'instructor');

    expect($user->fresh()->active_academy_id)->toBe($academyB->id);
});

it('PATCH /me/active-academy returns 422 when the user is not a member of the target academy', function (): void {
    $user = User::factory()->create();
    $owned = Academy::factory()->create();
    $strangers = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($owned)->owner()->create();
    $user->update(['active_academy_id' => $owned->id]);

    $this->actingAs($user)
        ->patchJson('/api/v1/me/active-academy', ['academy_id' => $strangers->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['academy_id']);

    // active_academy_id MUST NOT have moved.
    expect($user->fresh()->active_academy_id)->toBe($owned->id);
});

it('PATCH /me/active-academy returns 422 when the target membership is revoked', function (): void {
    $user = User::factory()->create();
    $owned = Academy::factory()->create();
    $past = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($owned)->owner()->create();
    AcademyMembership::factory()->for($user)->for($past)->instructor()->revoked()->create();
    $user->update(['active_academy_id' => $owned->id]);

    $this->actingAs($user)
        ->patchJson('/api/v1/me/active-academy', ['academy_id' => $past->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['academy_id']);
});

it('GET /me/active-academy requires authentication', function (): void {
    $this->getJson('/api/v1/me/active-academy')
        ->assertUnauthorized();
});

it('PATCH /me/active-academy requires authentication', function (): void {
    $this->patchJson('/api/v1/me/active-academy', ['academy_id' => 1])
        ->assertUnauthorized();
});
