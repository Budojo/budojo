<?php

declare(strict_types=1);

use App\Actions\Academy\SwitchActiveAcademyAction;
use App\Actions\Academy\SwitchActiveAcademyResult;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;

uses(RefreshDatabase::class);

it('switches the active_academy_id when the membership is active and returns the membership', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    /** @var Academy $academy */
    $owner = User::factory()->create();
    $academy = Academy::factory()->for($owner, 'owner')->create();

    /** @var AcademyMembership $membership */
    $membership = AcademyMembership::factory()
        ->for($user)
        ->for($academy)
        ->create(['revoked_at' => null]);

    $action = new SwitchActiveAcademyAction();
    $result = $action->execute($user, $academy->id);

    expect($result)->toBeInstanceOf(SwitchActiveAcademyResult::class);
    expect($result->revokedConcurrently)->toBeFalse();
    expect($result->membership?->id)->toBe($membership->id);

    $user->refresh();
    expect($user->active_academy_id)->toBe($academy->id);
});

it('returns revokedConcurrently when the matching membership row is revoked between validation and execute (#990)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    /** @var Academy $academy */
    $owner = User::factory()->create();
    $academy = Academy::factory()->for($owner, 'owner')->create();
    // Stale-state scenario: the membership row exists but the
    // `revoked_at` column was bumped between FormRequest validation
    // (which scanned for a non-revoked row) and our `execute()` call.
    // The Action must NOT persist the pointer in this case.
    AcademyMembership::factory()
        ->for($user)
        ->for($academy)
        ->create(['revoked_at' => now()]);

    $beforePointer = $user->active_academy_id;

    $action = new SwitchActiveAcademyAction();
    $result = $action->execute($user, $academy->id);

    expect($result->revokedConcurrently)->toBeTrue();
    expect($result->membership)->toBeNull();

    $user->refresh();
    expect($user->active_academy_id)->toBe($beforePointer);
});

it('reports the rare race to the log channel so it surfaces in Sentry (#991 reviewer)', function (): void {
    Log::spy();

    /** @var User $user */
    $user = User::factory()->create();
    /** @var Academy $academy */
    $owner = User::factory()->create();
    $academy = Academy::factory()->for($owner, 'owner')->create();
    AcademyMembership::factory()
        ->for($user)
        ->for($academy)
        ->create(['revoked_at' => now()]);

    $action = new SwitchActiveAcademyAction();
    $action->execute($user, $academy->id);

    // Laravel's `report()` helper writes through the default
    // ExceptionHandler, which logs to the configured channel. Asserting
    // the log dispatch keeps the observability invariant pinned —
    // dropping `report()` from the Action body would trip this spec.
    Log::shouldHaveReceived('error')->atLeast()->once();
});
