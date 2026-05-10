<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\OnboardingStep;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
 * whole card auto-dismisses when every step is explicitly ticked OR
 * the user clicks "Dismiss". The SPA does NOT today consult
 * domain-state proofs (existence of athletes, payments, etc.) as
 * auto-completion signals — only the explicit tick + dismiss flag
 * are load-bearing.
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

        // Wrapped in a transaction with `lockForUpdate()` so two
        // concurrent POSTs targeting different steps don't lose one
        // another's append — without the lock both can read the same
        // pre-image array, each append its own step, and the second
        // write clobbers the first. The lock-read-modify-write
        // sequence is the canonical fix for the lost-update race.
        $completed = DB::transaction(function () use ($user, $validated): array {
            /** @var User|null $locked */
            $locked = User::query()->lockForUpdate()->find($user->id);
            if ($locked === null) {
                return [];
            }
            $existing = $locked->onboarding_completed_steps ?? [];
            if (! \in_array($validated['step'], $existing, true)) {
                $existing[] = $validated['step'];
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

            return $existing;
        });

        return response()->json([
            'data' => [
                'completed_steps' => $completed,
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
