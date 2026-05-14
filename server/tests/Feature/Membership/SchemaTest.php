<?php

declare(strict_types=1);

use App\Enums\MembershipRole;
use App\Models\Academy;
use App\Models\AcademyInvitation;
use App\Models\AcademyMembership;
use App\Models\User;

/**
 * Schema-level tests for the multi-user transition (#427 / #714).
 *
 * Covers the raw shape contracts: factories produce valid rows,
 * cascade deletes work, casts wire up, and the unique constraints
 * fire as documented in the PRD § 5.
 */

it('AcademyMembership factory produces a valid row', function (): void {
    /** @var AcademyMembership $row */
    $row = AcademyMembership::factory()->create();

    expect($row->id)->toBeInt();
    expect($row->role)->toBeInstanceOf(MembershipRole::class);
    expect($row->isActive())->toBeTrue();
});

it('AcademyMembership::owner() / admin() / instructor() / assistant() state helpers set the role', function (): void {
    expect(AcademyMembership::factory()->owner()->make()->role)->toBe(MembershipRole::Owner);
    expect(AcademyMembership::factory()->admin()->make()->role)->toBe(MembershipRole::Admin);
    expect(AcademyMembership::factory()->instructor()->make()->role)->toBe(MembershipRole::Instructor);
    expect(AcademyMembership::factory()->assistant()->make()->role)->toBe(MembershipRole::Assistant);
});

it('AcademyMembership::revoked() flips revoked_at and isActive()', function (): void {
    $row = AcademyMembership::factory()->revoked()->create();
    expect($row->revoked_at)->not->toBeNull();
    expect($row->isActive())->toBeFalse();
});

it('cascades memberships when the user is hard-deleted', function (): void {
    $user = User::factory()->create();
    AcademyMembership::factory()->for($user)->count(2)->create();

    expect(AcademyMembership::query()->where('user_id', $user->id)->count())->toBe(2);
    $user->forceDelete();
    expect(AcademyMembership::query()->where('user_id', $user->id)->count())->toBe(0);
});

it('cascades memberships when the academy is hard-deleted', function (): void {
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($academy)->count(3)->create();

    $academy->forceDelete();
    expect(AcademyMembership::query()->where('academy_id', $academy->id)->count())->toBe(0);
});

it('enforces UNIQUE (user_id, academy_id) on memberships', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->create();

    expect(fn () => AcademyMembership::factory()->for($user)->for($academy)->create())
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('AcademyInvitation factory produces a valid row with role + token_hash + 7-day expiry', function (): void {
    /** @var AcademyInvitation $row */
    $row = AcademyInvitation::factory()->create();

    expect($row->role)->toBeInstanceOf(MembershipRole::class);
    expect(strlen($row->token_hash))->toBe(64);
    expect($row->expires_at->greaterThan(now()->addDays(6)))->toBeTrue();
});

it('AcademyInvitation::expired() pushes expires_at into the past', function (): void {
    $row = AcademyInvitation::factory()->expired()->create();
    expect($row->expires_at->lessThan(now()))->toBeTrue();
});

it('enforces UNIQUE (academy_id, email) on invitations', function (): void {
    $academy = Academy::factory()->create();
    AcademyInvitation::factory()->for($academy)->create(['email' => 'maria@example.com']);

    expect(fn () => AcademyInvitation::factory()->for($academy)->create(['email' => 'maria@example.com']))
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('cascades invitations when the academy is hard-deleted', function (): void {
    $academy = Academy::factory()->create();
    AcademyInvitation::factory()->for($academy)->count(2)->create();

    $academy->forceDelete();
    expect(AcademyInvitation::query()->where('academy_id', $academy->id)->count())->toBe(0);
});

it('User::memberships() relation returns all rows including revoked', function (): void {
    $user = User::factory()->create();
    AcademyMembership::factory()->for($user)->create();
    AcademyMembership::factory()->for($user)->revoked()->create();

    expect($user->memberships()->count())->toBe(2);
});

it('User::activeMembership() returns null when active_academy_id is unset', function (): void {
    $user = User::factory()->create(['active_academy_id' => null]);
    AcademyMembership::factory()->for($user)->create();

    expect($user->activeMembership())->toBeNull();
});

it('User::activeMembership() returns the row matching active_academy_id when not revoked', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    /** @var AcademyMembership $row */
    $row = AcademyMembership::factory()->for($user)->for($academy)->admin()->create();
    $user->update(['active_academy_id' => $academy->id]);

    $active = $user->fresh()->activeMembership();
    expect($active)->not->toBeNull();
    expect($active?->id)->toBe($row->id);
    expect($active?->role)->toBe(MembershipRole::Admin);
});

it('User::activeMembership() returns null when the pointed-at membership is revoked', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($user)->for($academy)->revoked()->create();
    $user->update(['active_academy_id' => $academy->id]);

    expect($user->fresh()->activeMembership())->toBeNull();
});

it('Academy::memberships() + invitations() relations resolve', function (): void {
    $academy = Academy::factory()->create();
    AcademyMembership::factory()->for($academy)->count(3)->create();
    AcademyInvitation::factory()->for($academy)->count(2)->create();

    expect($academy->memberships()->count())->toBe(3);
    expect($academy->invitations()->count())->toBe(2);
});

it('MembershipRole enum has exactly four cases in PRD order', function (): void {
    $cases = MembershipRole::cases();
    expect(count($cases))->toBe(4);
    expect(array_map(fn (MembershipRole $r) => $r->value, $cases))->toBe([
        'owner',
        'admin',
        'instructor',
        'assistant',
    ]);
});
