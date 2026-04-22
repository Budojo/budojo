<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAthleteRequest extends FormRequest
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
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'belt' => ['required', Rule::enum(Belt::class)],
            'stripes' => ['integer', 'min:0', 'max:4'],
            'status' => ['required', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['required', 'date'],
        ];
    }
}
