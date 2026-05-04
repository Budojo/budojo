<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Shared FormRequest for `?months=N` query params on the two monthly
 * stats endpoints. Default 12, max 24 — beyond two years the chart
 * becomes too dense to read on a phone, and we don't have a use case
 * yet that justifies the cost.
 *
 * Mirrors the gating pattern used elsewhere in the codebase: authorize()
 * checks the academy ownership invariant; the controller defends in
 * depth (see AttendanceController::summary).
 */
class MonthsRangeRequest extends FormRequest
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
            'months' => ['sometimes', 'integer', 'min:1', 'max:24'],
        ];
    }

    public function months(): int
    {
        return $this->has('months') ? $this->integer('months') : 12;
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
