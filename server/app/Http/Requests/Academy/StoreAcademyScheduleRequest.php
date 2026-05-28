<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Schedule a future `training_days` change (#1094).
 *
 * `effective_from` MUST be strictly after today — same-day changes go
 * through the canonical `PATCH /api/v1/academy` (which calls
 * `UpdateAcademyAction` and writes a row with `effective_from = today`).
 * Past dates are immutable and never accepted here.
 *
 * Only one pending future row per academy at any time — the single
 * pending-change invariant from the PRD (`docs/specs/training-schedule-history.md`).
 * The owner cancels the pending row (DELETE) before scheduling another.
 */
class StoreAcademyScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();

        return $user !== null && $user->activeAcademy() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // `null` is a valid training_days payload (the "schedule
            // not configured for this period" sentinel — parity with
            // POST /academy + PATCH /academy).
            'training_days' => ['present', 'nullable', 'array', 'min:1', 'max:7'],
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],

            // `date_format` pins the wire shape to ISO calendar date.
            // `after:today` rejects today and earlier — same-day goes
            // through PATCH /academy.
            'effective_from' => ['required', 'date_format:Y-m-d', 'after:today'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'effective_from.after' => 'Choose a date after today — same-day changes go through the academy update endpoint.',
        ];
    }

    // NOTE: the single-pending-future invariant is enforced
    // race-safely inside `ScheduleAcademyChangeAction::execute()` —
    // a previous shape of this FormRequest checked existence here via
    // `withValidator`, but that's a SELECT-with-no-lock and two
    // simultaneous POSTs from the same owner (multi-tab, retried
    // request) could both pass the check and both insert. The Action
    // now opens a transaction, takes a `lockForUpdate()` exclusive lock
    // (Laravel's `FOR UPDATE`, not `FOR SHARE`) on the owning academy
    // row, re-checks existence, then inserts — so concurrent POSTs
    // serialize on the academy row and the second surfaces a clean
    // `PendingScheduleAlreadyExistsException` instead of a 500 from
    // the DB.
}
