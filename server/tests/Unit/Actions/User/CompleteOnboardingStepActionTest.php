<?php

declare(strict_types=1);

use App\Actions\User\CompleteOnboardingStepAction;
use App\Models\User;
use App\Support\OnboardingStep;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('appends the step to an empty list and persists it', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => null]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, OnboardingStep::ADD_ATHLETE);

    expect($result)->toBe([OnboardingStep::ADD_ATHLETE]);
    $user->refresh();
    expect($user->onboarding_completed_steps)->toBe([OnboardingStep::ADD_ATHLETE]);
});

it('is idempotent — re-executing the same step never duplicates', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'onboarding_completed_steps' => [OnboardingStep::ADD_ATHLETE],
    ]);

    $action = new CompleteOnboardingStepAction();
    $action->execute($user, OnboardingStep::ADD_ATHLETE);
    $second = $action->execute($user, OnboardingStep::ADD_ATHLETE);

    expect($second)->toBe([OnboardingStep::ADD_ATHLETE]);
    $user->refresh();
    expect($user->onboarding_completed_steps)->toBe([OnboardingStep::ADD_ATHLETE]);
});

it('appends additional steps preserving prior ticks', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'onboarding_completed_steps' => [OnboardingStep::ADD_ATHLETE],
    ]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, OnboardingStep::UPLOAD_DOCUMENT);

    expect($result)->toBe([OnboardingStep::ADD_ATHLETE, OnboardingStep::UPLOAD_DOCUMENT]);
});

it('returns a list<string> with sequential integer keys (PHPStan contract)', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'onboarding_completed_steps' => [OnboardingStep::ADD_ATHLETE],
    ]);

    $action = new CompleteOnboardingStepAction();
    $result = $action->execute($user, OnboardingStep::UPLOAD_DOCUMENT);

    // `array_values()` in the Action guarantees this — pin the
    // invariant so a future refactor that drops the cast trips here
    // before PHPStan + the wire shape can drift.
    expect(array_keys($result))->toBe([0, 1]);
});

it('mirrors the persisted state onto the caller-side $user instance', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['onboarding_completed_steps' => null]);

    $action = new CompleteOnboardingStepAction();
    $action->execute($user, OnboardingStep::ADD_ATHLETE);

    // The in-memory `$user` reference (NOT refreshed from DB)
    // sees the post-write state — test-correctness scaffolding
    // for callers like `actingAs($user)` that hold a model
    // reference across multiple operations.
    expect($user->onboarding_completed_steps)->toBe([OnboardingStep::ADD_ATHLETE]);
});
