<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\OnboardingStep;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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
 * whole card auto-dismisses when every step is checked OR the user
 * explicitly clicks "Dismiss".
 */
class OnboardingController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'dismissed_at' => $user->onboarding_dismissed_at?->toIso8601String(),
                'completed_steps' => $user->onboarding_completed_steps ?? [],
                'available_steps' => OnboardingStep::all(),
            ],
        ]);
    }

    public function completeStep(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'step' => ['required', 'string', Rule::in(OnboardingStep::all())],
        ]);

        $existing = $user->onboarding_completed_steps ?? [];
        // Idempotent: adding the same step twice keeps the array
        // unique. Re-posting is allowed (the SPA may fire on
        // background heuristics — last-attendance row, first
        // payment marked — and we don't want to 422 on those).
        if (! \in_array($validated['step'], $existing, true)) {
            $existing[] = $validated['step'];
            $user->forceFill(['onboarding_completed_steps' => $existing])->save();
        }

        return response()->json([
            'data' => [
                'completed_steps' => $existing,
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
