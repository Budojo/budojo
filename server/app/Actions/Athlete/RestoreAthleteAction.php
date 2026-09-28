<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Exceptions\FiscalCodeTakenException;
use App\Models\Athlete;

/**
 * Bring a soft-deleted athlete back into the active roster (#700).
 *
 * Single-purpose action per the Uncle Bob canon: flips
 * `athletes.deleted_at` to null and returns the refreshed model.
 * The controller is responsible for the authorisation gate (academy
 * ownership) BEFORE calling `execute()`; this action assumes the
 * caller has already cleared that check.
 *
 * **What restore actually restores** (the partial-undo policy):
 *  - The athlete row itself — `deleted_at` flips back to null.
 *  - The athlete's payment / attendance / promotion history — those
 *    tables aren't soft-deleteable; their rows have remained in the
 *    DB the whole time, just invisible because every list query
 *    joins through `athletes` and the soft-delete scope filtered the
 *    join. With the athlete back, those rows surface again.
 *
 * **What restore does NOT restore**: documents. `AthleteObserver::deleting`
 * calls `DeleteDocumentAction` per document, which both soft-deletes
 * the row AND wipes the file from disk (M3 PRD GDPR policy). The
 * delete confirm UI surfaces a prominent warning about this; the
 * restored athlete starts with an empty documents tab.
 *
 * **What refuses a restore**: a codice fiscale that a live athlete of the
 * same academy has taken since (#1934). The unique rule keeps two live rows
 * from sharing one, and a restore goes around every validator.
 */
class RestoreAthleteAction
{
    /**
     * @throws FiscalCodeTakenException
     */
    public function execute(Athlete $athlete): Athlete
    {
        $holder = $this->liveHolderOfCode($athlete);
        if ($holder !== null) {
            throw new FiscalCodeTakenException($holder);
        }

        $athlete->restore();

        return $athlete->fresh() ?? $athlete;
    }

    private function liveHolderOfCode(Athlete $athlete): ?Athlete
    {
        if ($athlete->fiscal_code === null) {
            return null;
        }

        return Athlete::query()
            ->where('academy_id', $athlete->academy_id)
            ->where('fiscal_code', $athlete->fiscal_code)
            ->whereKeyNot($athlete->id)
            ->first();
    }
}
