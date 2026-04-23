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
 */
function userWithAcademy(): User
{
    $user = User::factory()->create();
    Academy::factory()->for($user, 'owner')->create();

    return $user->fresh();
}
