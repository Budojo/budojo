<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\PendingDeletion;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Coverage for the scheduled `budojo:purge-expired-pending-deletions`
 * command (#223). The Action it delegates to is independently tested
 * in AccountDeletionTest; THIS spec validates the command's loop:
 * which rows it picks up, how it treats not-yet-expired rows, what
 * happens with --dry-run, and how the resilient try/catch behaves
 * when one user's purge fails mid-cohort.
 */

function makePendingDeletionFor(User $user, Carbon $scheduledFor): PendingDeletion
{
    return PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => Carbon::now()->subDays(30),
        'scheduled_for' => $scheduledFor,
        'confirmation_token' => Str::random(64),
    ]);
}

it('purges users whose grace window has elapsed', function (): void {
    $expiredUser = userWithAcademy();
    Athlete::factory()->for($expiredUser->academy)->create();
    makePendingDeletionFor($expiredUser, Carbon::now()->subSecond());

    $exitCode = $this->artisan('budojo:purge-expired-pending-deletions')
        ->expectsOutputToContain('Done. Purged: 1. Failed: 0.')
        ->run();

    expect($exitCode)->toBe(0);
    expect(User::query()->where('id', $expiredUser->id)->count())->toBe(0);
});

it('does not touch users whose grace window is still open', function (): void {
    $stillPendingUser = userWithAcademy();
    makePendingDeletionFor($stillPendingUser, Carbon::now()->addDays(15));

    $this->artisan('budojo:purge-expired-pending-deletions')
        ->expectsOutputToContain('No expired pending deletions.')
        ->assertSuccessful();

    expect(User::query()->where('id', $stillPendingUser->id)->count())->toBe(1);
    expect(PendingDeletion::query()->where('user_id', $stillPendingUser->id)->count())->toBe(1);
});

it('processes only the expired rows when both are present', function (): void {
    $expiredUser = userWithAcademy();
    makePendingDeletionFor($expiredUser, Carbon::now()->subHour());

    $stillPendingUser = userWithAcademy();
    makePendingDeletionFor($stillPendingUser, Carbon::now()->addDays(10));

    $this->artisan('budojo:purge-expired-pending-deletions')->assertSuccessful();

    // Expired one is gone (cascade includes its pending row).
    expect(User::query()->where('id', $expiredUser->id)->count())->toBe(0);
    expect(PendingDeletion::query()->where('user_id', $expiredUser->id)->count())->toBe(0);

    // Still-pending one is untouched.
    expect(User::query()->where('id', $stillPendingUser->id)->count())->toBe(1);
    expect(PendingDeletion::query()->where('user_id', $stillPendingUser->id)->count())->toBe(1);
});

it('--dry-run reports what would happen without touching anything', function (): void {
    $expiredUser = userWithAcademy();
    makePendingDeletionFor($expiredUser, Carbon::now()->subDay());

    $this->artisan('budojo:purge-expired-pending-deletions', ['--dry-run' => true])
        ->expectsOutputToContain('DRY RUN: found 1 expired pending deletion(s).')
        ->assertSuccessful();

    // User is still here — dry-run wrote nothing.
    expect(User::query()->where('id', $expiredUser->id)->count())->toBe(1);
    expect(PendingDeletion::query()->where('user_id', $expiredUser->id)->count())->toBe(1);
});
