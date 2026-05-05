<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Models\User;

it('defaults role to owner for every newly-created user (backwards compat)', function (): void {
    // Public registration + factory creation both produce owners by
    // default — the migration's column default is the trip-wire.
    $user = User::factory()->create();

    expect($user->role)->toBe(UserRole::Owner);
    expect($user->isOwner())->toBeTrue();
    expect($user->isAthlete())->toBeFalse();
});

it('flips the role helpers when the user is an athlete', function (): void {
    $user = User::factory()->athlete()->create();

    expect($user->role)->toBe(UserRole::Athlete);
    expect($user->isOwner())->toBeFalse();
    expect($user->isAthlete())->toBeTrue();
});

it('persists the role as the lower-case enum value, not the case name', function (): void {
    // Same enum-casing guard SupportTicket carries — the DB column
    // stores `owner` / `athlete`, never `Owner` / `Athlete`.
    $user = User::factory()->athlete()->create();

    $row = \DB::table('users')->where('id', $user->id)->first();
    expect($row)->not->toBeNull();
    expect($row->role)->toBe('athlete');
});
