<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Models\AcademySchedule;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Validator;

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

    /**
     * Cross-field invariant: at most one pending future row per
     * academy. Runs after the per-field rules so we have a clean
     * `effective_from` value to assert against (and never error on a
     * field whose value didn't parse).
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            /** @var User $user */
            $user = $this->user();
            /** @var \App\Models\Academy $academy */
            $academy = $user->activeAcademy();

            $existing = AcademySchedule::query()
                ->where('academy_id', $academy->id)
                ->where('effective_from', '>', Carbon::today()->toDateString())
                ->exists();

            if ($existing) {
                $v->errors()->add(
                    'effective_from',
                    'A pending future schedule already exists. Cancel it before scheduling another.',
                );
            }
        });
    }
}
