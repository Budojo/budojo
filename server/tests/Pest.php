<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(
    Tests\TestCase::class,
    RefreshDatabase::class,
)->in('Feature');

uses(Tests\TestCase::class)->in('Unit');

/**
 * Create a user that owns an academy — the starting state for every
 * authenticated feature test in the app.
 *
 * The `AcademyObserver::created()` hook auto-bootstraps the matching
 * `AcademyMembership` (`role = owner`) and sets the user's
 * `active_academy_id` pointer, so this helper still returns a user
 * whose `canInAcademy(...)` works without any additional wiring in
 * each test. See `App\Observers\AcademyObserver` for the
 * implementation.
 */
function userWithAcademy(): User
{
    $user = User::factory()->create();
    Academy::factory()->for($user, 'owner')->create();

    return $user->fresh();
}
