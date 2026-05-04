<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Validates the `?months=` query parameter for the daily attendance
 * heatmap endpoint. Only {3, 6, 12} are accepted — these are the three
 * buttons exposed in the UI. Any other value (including valid integers like
 * 4 or 9) returns 422 so clients can't probe unbounded windows.
 *
 * Kept separate from MonthsRangeRequest (which accepts 1–24 for the
 * payments endpoint) to keep validation rules adjacent to their use.
 */
class DailyAttendanceRangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->academy !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'months' => ['sometimes', 'integer', 'in:3,6,12'],
        ];
    }

    public function months(): int
    {
        return $this->integer('months', 3);
    }

    /**
     * Override the default 403-AuthorizationException with a structured
     * JSON envelope — keeps `/api/v1/stats/*` consistent with every other
     * authenticated endpoint in this codebase (see e.g. MonthlySummaryRequest).
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
