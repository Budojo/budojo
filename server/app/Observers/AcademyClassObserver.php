<?php

declare(strict_types=1);

namespace App\Observers;

use App\Actions\Academy\DeriveTrainingDaysFromTimetableAction;
use App\Models\AcademyClass;

/**
 * A class changed, so the academy's training days may have (#1575).
 *
 * Humble on purpose: the rule — which days, when to leave them alone — lives
 * in the Action. This only says *when* to ask: after a class is saved (new,
 * or moved to another day) and after one is deleted. `deleted` still has the
 * academy through the row's `academy_id`; the relation is loaded, not
 * assumed, because a class created through the factory may never have had it.
 */
class AcademyClassObserver
{
    public function __construct(
        private readonly DeriveTrainingDaysFromTimetableAction $deriveTrainingDays,
    ) {
    }

    public function saved(AcademyClass $class): void
    {
        $this->derive($class);
    }

    public function deleted(AcademyClass $class): void
    {
        $this->derive($class);
    }

    private function derive(AcademyClass $class): void
    {
        $academy = $class->academy()->first();
        if ($academy !== null) {
            $this->deriveTrainingDays->execute($academy);
        }
    }
}
