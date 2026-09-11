<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\CompleteOnboardingStepAction;
use App\Actions\User\ResolveOnboardingStepsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\CompleteOnboardingStepRequest;
use App\Models\User;
use App\Support\OnboardingStep;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * First-run onboarding state surface (#424). Read + write over the
 * two `users` columns `onboarding_dismissed_at` and
 * `onboarding_completed_steps`. Three endpoints:
 *
 *  - **`GET /me/onboarding`**           — current state snapshot for
 *    the SPA to decide whether to render the tour / checklist.
 *  - **`POST /me/onboarding/steps`**    — mark a single step done.
 *    Idempotent: re-posting the same step is a no-op.
 *  - **`POST /me/onboarding/dismiss`**  — stamp
 *    `onboarding_dismissed_at = now()`. Permanent — the SPA never
 *    re-renders the tour after this, even if localStorage is wiped.
 *
 * The "Getting started" checklist on the dashboard home is
 * idempotent against this state: completed steps tick green and the
 * whole card auto-dismisses when every step is explicitly ticked OR
 * the user clicks "Dismiss". The SPA does NOT today consult
 * domain-state proofs (existence of athletes, payments, etc.) as
 * auto-completion signals — only the explicit tick + dismiss flag
 * are load-bearing.
 */
class OnboardingController extends Controller
{
    public function __construct(
        private readonly CompleteOnboardingStepAction $completeStep,
        private readonly ResolveOnboardingStepsAction $resolveSteps,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'dismissed_at' => $user->onboarding_dismissed_at?->toIso8601String(),
                'completed_steps' => $this->resolveSteps->execute($user),
                'available_steps' => OnboardingStep::all(),
            ],
        ]);
    }

    public function completeStep(CompleteOnboardingStepRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var array{step: string} $validated */
        $validated = $request->validated();

        $this->completeStep->execute($user, $validated['step']);

        // Resolved, not the action's return value: a manual tick is one input
        // to the answer (#1536), and the caller should get the same list
        // `show()` would give it rather than a partial one it has to merge.
        return response()->json([
            'data' => [
                'completed_steps' => $this->resolveSteps->execute($user->refresh()),
            ],
        ]);
    }

    public function dismiss(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Idempotent: re-dismissing is a no-op, the timestamp is NOT
        // overwritten. The first dismissal is the meaningful one.
        if ($user->onboarding_dismissed_at === null) {
            $user->forceFill(['onboarding_dismissed_at' => now()])->save();
        }

        return response()->json([
            'data' => [
                'dismissed_at' => $user->onboarding_dismissed_at?->toIso8601String(),
            ],
        ]);
    }
}
