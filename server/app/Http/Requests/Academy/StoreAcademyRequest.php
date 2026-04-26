<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use Illuminate\Foundation\Http\FormRequest;

class StoreAcademyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            // Carbon dayOfWeek convention (0=Sun..6=Sat). `null` / omitted =
            // "schedule not configured", which the daily check-in UI uses
            // as the signal to fall back to all-weekdays.
            'training_days' => ['sometimes', 'nullable', 'array', 'max:7'],
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],
        ];
    }
}
