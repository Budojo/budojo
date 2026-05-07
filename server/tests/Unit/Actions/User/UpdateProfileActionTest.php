<?php

declare(strict_types=1);

use App\Actions\User\UpdateProfileAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('lowercases the handle on save (defensive guard for non-HTTP callers)', function (): void {
    // The HTTP path is gated by `HandleFormat` which rejects mixed-case
    // input, so this branch never fires in production. We still keep
    // the lowercase-on-save guard so a future programmatic caller (a
    // CLI seeder, a back-office tool, an admin API) can't stash a
    // mixed-case row that bypasses the unique-collision invariant.
    /** @var User $user */
    $user = User::factory()->create(['handle' => null]);

    $action = new UpdateProfileAction();
    $action->execute($user, 'Mario', 'Rossi', 'MaTteo.RoSSi');

    $user->refresh();
    expect($user->handle)->toBe('matteo.rossi');
});

it('persists null when the caller passes null', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['handle' => 'matteo']);

    $action = new UpdateProfileAction();
    $action->execute($user, 'Mario', 'Rossi', null);

    $user->refresh();
    expect($user->handle)->toBeNull();
});
