<?php

declare(strict_types=1);

use App\Actions\User\PurgeAccountAction;
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

it('keeps going when one user`s purge throws + returns FAILURE exit code', function (): void {
    $okUserA = userWithAcademy();
    $okUserB = userWithAcademy();
    $brokenUser = userWithAcademy();

    makePendingDeletionFor($okUserA, Carbon::now()->subHour());
    makePendingDeletionFor($brokenUser, Carbon::now()->subHour());
    makePendingDeletionFor($okUserB, Carbon::now()->subHour());

    // Stub the Action so it throws ONLY for $brokenUser; the others
    // go through the real path. Bind a wrapper into the container
    // that forwards to a real Action for non-broken ids.
    $real = new PurgeAccountAction();
    $brokenId = $brokenUser->id;
    app()->instance(PurgeAccountAction::class, new class ($real, $brokenId) extends PurgeAccountAction {
        public function __construct(private PurgeAccountAction $delegate, private int $brokenId)
        {
        }

        public function execute(User $user): void
        {
            if ($user->id === $this->brokenId) {
                throw new \RuntimeException('simulated disk-permission failure');
            }
            $this->delegate->execute($user);
        }
    });

    $exitCode = $this->artisan('budojo:purge-expired-pending-deletions')
        ->expectsOutputToContain('Done. Purged: 2. Failed: 1.')
        ->run();

    // Non-zero exit so cron alerts can fire.
    expect($exitCode)->toBe(1);

    // The two healthy users were purged despite the middle one failing.
    expect(User::query()->where('id', $okUserA->id)->count())->toBe(0);
    expect(User::query()->where('id', $okUserB->id)->count())->toBe(0);

    // The broken user is still there + their pending row too — next
    // hourly run will retry.
    expect(User::query()->where('id', $brokenUser->id)->count())->toBe(1);
    expect(PendingDeletion::query()->where('user_id', $brokenUser->id)->count())->toBe(1);
});

it('does not log the user`s email address (PII discipline for cron logs)', function (): void {
    $expiredUser = userWithAcademy();
    $email = $expiredUser->email;
    makePendingDeletionFor($expiredUser, Carbon::now()->subSecond());

    // PII discipline: the cron output is consumed by ops log
    // aggregators that aren't necessarily aligned with the GDPR
    // erasure pipeline. We assert the user_id IS printed (so the
    // run is auditable) and the email is NOT (so PII doesn't leak
    // sideways). `expectsOutputToContain` + `doesntExpectOutputToContain`
    // are part of Laravel's PendingCommand on this stack.
    $this->artisan('budojo:purge-expired-pending-deletions')
        ->expectsOutputToContain("purged user #{$expiredUser->id}")
        ->doesntExpectOutputToContain($email)
        ->assertSuccessful();
});
