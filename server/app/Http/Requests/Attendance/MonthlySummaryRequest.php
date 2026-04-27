<?php

declare(strict_types=1);

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class MonthlySummaryRequest extends FormRequest
{
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
        // `regex` check covers the YYYY-MM shape; `date_format:Y-m` in
        // Laravel's validator accepts malformed months like 2026-13, so
        // we pair the format check with a stricter regex.
        return [
            'month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'month.regex' => 'The month must be in YYYY-MM format, e.g. 2026-04.',
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
