<?php

declare(strict_types=1);

use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Carbon;

it('purges only expired rows, leaves active rows alone', function (): void {
    /** @var User $userA */
    $userA = User::factory()->create();
    /** @var User $userB */
    $userB = User::factory()->create();

    PendingEmailChange::factory()->expired()->create(['user_id' => $userA->id]);
    PendingEmailChange::factory()->create(['user_id' => $userB->id]); // active (default expires +1d)

    $this->artisan('budojo:purge-expired-email-changes')
        ->expectsOutputToContain('Done. Purged: 1.')
        ->assertSuccessful();

    expect(PendingEmailChange::query()->where('user_id', $userA->id)->count())->toBe(0);
    expect(PendingEmailChange::query()->where('user_id', $userB->id)->count())->toBe(1);
});

it('reports a clean run when there is nothing to do', function (): void {
    $this->artisan('budojo:purge-expired-email-changes')
        ->expectsOutputToContain('No expired email-change tokens.')
        ->assertSuccessful();
});

it('caps at 1000 deletes per run', function (): void {
    // Generate 1005 expired rows. The cap should leave 5 of them
    // standing — the next hourly run picks them up. Each row needs a
    // unique user_id (DB UNIQUE), so we pre-create users in bulk.
    $now = Carbon::now()->subHour();
    User::factory()
        ->count(1005)
        ->create()
        ->each(function (User $user) use ($now): void {
            PendingEmailChange::factory()->create([
                'user_id' => $user->id,
                'expires_at' => $now,
            ]);
        });

    expect(PendingEmailChange::query()->count())->toBe(1005);

    $this->artisan('budojo:purge-expired-email-changes')
        ->expectsOutputToContain('Done. Purged: 1000.')
        ->assertSuccessful();

    expect(PendingEmailChange::query()->count())->toBe(5);
});

it('--dry-run reports the cohort without touching the DB', function (): void {
    /** @var User $userA */
    $userA = User::factory()->create();
    PendingEmailChange::factory()->expired()->create(['user_id' => $userA->id]);

    $this->artisan('budojo:purge-expired-email-changes', ['--dry-run' => true])
        ->expectsOutputToContain('DRY RUN: found 1 expired email-change token(s).')
        ->assertSuccessful();

    // Row still there.
    expect(PendingEmailChange::query()->where('user_id', $userA->id)->count())->toBe(1);
});
