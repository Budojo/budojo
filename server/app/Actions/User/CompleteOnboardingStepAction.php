<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Appends a single onboarding step to `users.onboarding_completed_steps`
 * idempotently (#992 — controller-bloat extraction).
 *
 * Wraps the read-modify-write inside a `DB::transaction` with
 * `lockForUpdate()` so two concurrent POSTs targeting different steps
 * don't lose one another's append. Without the lock both can read the
 * same pre-image array, each append its own step, and the second write
 * clobbers the first — the canonical lost-update race.
 *
 * Why this lives in an Action (Uncle Bob canon — Clean Architecture):
 * the controller used to inline both `$request->validate()` AND the
 * transaction. That couples HTTP orchestration to a domain-level
 * concurrency invariant. The Action is the right home — the
 * FormRequest sibling (`CompleteOnboardingStepRequest`) carries the
 * validation rule, the controller stays thin.
 */
class CompleteOnboardingStepAction
{
    /**
     * @param User $user   the authenticated user whose checklist is being ticked
     * @param string $step the step key (already validated against `OnboardingStep::all()`)
     * @return list<string> the post-write list of completed steps
     */
    public function execute(User $user, string $step): array
    {
        return DB::transaction(function () use ($user, $step): array {
            /** @var User|null $locked */
            $locked = User::query()->lockForUpdate()->find($user->id);
            if ($locked === null) {
                return [];
            }
            $existing = $locked->onboarding_completed_steps ?? [];
            if (! \in_array($step, $existing, true)) {
                $existing[] = $step;
                $locked->forceFill(['onboarding_completed_steps' => $existing])->save();
            }

            // Mirror the persisted state back onto the caller-side
            // $user so subsequent reads on the same instance (e.g. a
            // GET in the same test that uses actingAs($user)) see
            // the fresh value. In production each request rehydrates
            // from the token, so this is test-correctness scaffolding
            // — but it also avoids surprising callers that pass a
            // model around across multiple operations.
            $user->setAttribute('onboarding_completed_steps', $existing);

            return array_values($existing);
        });
    }
}
