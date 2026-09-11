<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Document;
use App\Models\User;
use App\Support\OnboardingStep;

/**
 * Which onboarding steps are done — read from the academy, not from a diary
 * of clicks (#1536).
 *
 * The checklist used to report only `users.onboarding_completed_steps`, and
 * the sole thing that ever wrote to that column was the user pressing the
 * circle on the checklist itself. Nothing in the app ticked a step when the
 * step was actually performed. So an academy with 33 athletes, 4510
 * attendance records and 392 payments opened the roster to:
 *
 *     Getting started · 0 of 5 done
 *     ○ Add your first athlete
 *
 * ...occupying the whole first screen of the page whose job is to list
 * athletes, until dismissed by hand.
 *
 * That is not only what a seeded demo looks like. It is what a real owner
 * gets after a CSV import (#1346), after a backup restore, on a second
 * machine, or on any account whose data predates the checklist.
 *
 * Four of the five steps are questions the database can answer, so it answers
 * them. `view_stats` is the exception and stays manual: visiting a page leaves
 * no trace to read back, and inventing one to tick a checklist would be the
 * tail wagging the dog.
 *
 * The manual ticks are still honoured and unioned in — someone who ticks a
 * step they do not intend to use keeps it ticked.
 */
final class ResolveOnboardingStepsAction
{
    /**
     * @return list<string> the step keys this user has completed, in catalogue order
     */
    public function execute(User $user): array
    {
        /** @var list<string> $manual */
        $manual = $user->onboarding_completed_steps ?? [];
        $done = array_flip($manual);

        $academy = $user->activeAcademy();

        if ($academy !== null) {
            // `exists()` per step rather than counting: the question is "has
            // this ever happened", and on a roster of hundreds a count would
            // walk rows to answer something the first one settles.
            if ($academy->athletes()->exists()) {
                $done[OnboardingStep::ADD_ATHLETE] = true;
            }

            // Scoped through the academy's athletes, so a step cannot be
            // satisfied by another academy's records on a shared user.
            $athleteIds = $academy->athletes()->select('id');

            if (AttendanceRecord::whereIn('athlete_id', $athleteIds)->exists()) {
                $done[OnboardingStep::LOG_ATTENDANCE] = true;
            }

            if (AthletePayment::whereIn('athlete_id', $athleteIds)->exists()) {
                $done[OnboardingStep::MARK_PAYMENT] = true;
            }

            if (Document::whereIn('athlete_id', $athleteIds)->exists()) {
                $done[OnboardingStep::UPLOAD_DOCUMENT] = true;
            }
        }

        // Catalogue order, not insertion order: the SPA renders one card per
        // key from the same list, and a response ordered by when a row
        // happened to be found would read as arbitrary.
        return array_values(array_filter(
            OnboardingStep::all(),
            static fn (string $step): bool => isset($done[$step]),
        ));
    }
}
