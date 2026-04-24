<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class MarkAttendanceRequest extends FormRequest
{
    /** @var int */
    private const BACKFILL_DAYS = 7;

    /**
     * Ownership gate: the authenticated user must own an academy. Per-
     * athlete ownership (is every ID in athlete_ids actually in my
     * academy?) is handled in the controller — validating it here would
     * require a second query at request-resolve time and blur the
     * FormRequest's responsibility. Canon split: FormRequest validates
     * SHAPE, controller validates WHO-OWNS-WHAT.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // The backfill window and "no future" cap come from PRD § P0.3.
        // Both bounds are inclusive dates; `today` counts as a valid mark,
        // and 7 days ago is the earliest allowed.
        //
        // Capture `now()` ONCE and derive both bounds off the same reference
        // — calling now() twice a few microseconds apart can straddle a
        // midnight rollover (or, more pragmatically, a Carbon::setTestNow
        // mid-request-lifecycle), producing earliest/latest pairs that
        // disagree with each other and flake boundary requests.
        $today = now();
        $earliest = $today->copy()->subDays(self::BACKFILL_DAYS)->toDateString();
        $latest = $today->toDateString();

        return [
            'date' => ['required', 'date_format:Y-m-d', "after_or_equal:{$earliest}", "before_or_equal:{$latest}"],
            // `distinct` drops duplicate ids at the request layer — the
            // controller's cross-academy count check would otherwise treat
            // `[1, 1]` as "only one owned out of two" and false-403.
            'athlete_ids' => ['required', 'array', 'min:1'],
            'athlete_ids.*' => ['integer', 'exists:athletes,id', 'distinct'],
        ];
    }

    /**
     * Custom validation messages. The default Laravel `after_or_equal` /
     * `before_or_equal` messages leak the literal computed date strings
     * ("must be after or equal to 2026-04-17"), which reads weird to the
     * end user. Replace with the semantic window.
     */
    public function messages(): array
    {
        return [
            'date.after_or_equal' => 'Attendance can only be backfilled within the last ' . self::BACKFILL_DAYS . ' days.',
            'date.before_or_equal' => 'Attendance cannot be marked for a future date.',
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
