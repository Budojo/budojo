<?php

declare(strict_types=1);

use App\Actions\User\CompleteOnboardingStepAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('appends the step to an empty list and persists it', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => null]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, 'create_athlete');

    expect($result)->toBe(['create_athlete']);
    $user->refresh();
    expect($user->onboarding_completed_steps)->toBe(['create_athlete']);
});

it('is idempotent — re-executing the same step never duplicates', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => ['create_athlete']]);

    $action = new CompleteOnboardingStepAction();
    $action->execute($user, 'create_athlete');
    $second = $action->execute($user, 'create_athlete');

    expect($second)->toBe(['create_athlete']);
    $user->refresh();
    expect($user->onboarding_completed_steps)->toBe(['create_athlete']);
});

it('appends additional steps preserving prior ticks', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => ['create_athlete']]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, 'upload_document');

    expect($result)->toBe(['create_athlete', 'upload_document']);
});

it('returns a list<string> with sequential integer keys (PHPStan contract)', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => ['create_athlete']]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, 'upload_document');

    // `array_values()` in the Action guarantees this — pin the
    // invariant so a future refactor that drops the cast trips here
    // before PHPStan + the wire shape can drift.
    expect(array_keys($result))->toBe([0, 1]);
});

it('mirrors the persisted state onto the caller-side $user instance', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => null]);

    $action = new CompleteOnboardingStepAction();
    $action->execute($user, 'create_athlete');

    // The in-memory `$user` reference (NOT refreshed from DB)
    // sees the post-write state — test-correctness scaffolding
    // for callers like `actingAs($user)` that hold a model
    // reference across multiple operations.
    expect($user->onboarding_completed_steps)->toBe(['create_athlete']);
});
