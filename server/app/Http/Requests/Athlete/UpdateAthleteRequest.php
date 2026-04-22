<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAthleteRequest extends FormRequest
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
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
            'belt' => ['sometimes', Rule::enum(Belt::class)],
            'stripes' => ['sometimes', 'integer', 'min:0', 'max:4'],
            'status' => ['sometimes', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['sometimes', 'date'],
        ];
    }
}
