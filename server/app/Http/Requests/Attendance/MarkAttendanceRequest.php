<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class MarkAttendanceRequest extends FormRequest
{
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
        // No floor on backfill (#181). User feedback: a one-week cap on
        // backdating attendance was too tight — coaches frequently need
        // to populate older sessions (post-hoc data entry, missed days,
        // catching up after a holiday). Single-instructor academy, the
        // trust model is "you control your own data".
        //
        // Future cap is still enforced — attendance for tomorrow is
        // semantically wrong and the FormRequest blocks it.
        $latest = now()->toDateString();

        return [
            'date' => ['required', 'date_format:Y-m-d', "before_or_equal:{$latest}"],
            // `distinct` drops duplicate ids at the request layer — the
            // controller's cross-academy count check would otherwise treat
            // `[1, 1]` as "only one owned out of two" and false-403.
            'athlete_ids' => ['required', 'array', 'min:1'],
            'athlete_ids.*' => ['integer', 'exists:athletes,id', 'distinct'],
        ];
    }

    /**
     * Custom validation messages. The default Laravel `before_or_equal`
     * message leaks the literal computed date string ("must be before or
     * equal to 2026-04-28"), which reads weird to the end user. Replace
     * with the semantic constraint.
     */
    public function messages(): array
    {
        return [
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
