<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAthleteRequest extends FormRequest
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
        $academyId = $this->user()?->academy?->id;

        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');

        return [
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'email' => [
                'sometimes',
                'nullable',
                'email',
                'max:255',
                Rule::unique('athletes', 'email')
                    ->where('academy_id', $academyId)
                    ->ignore($athlete?->id)
                    ->whereNull('deleted_at'),
            ],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
            'belt' => ['sometimes', Rule::enum(Belt::class)],
            'stripes' => ['sometimes', 'integer', 'min:0', 'max:4'],
            'status' => ['sometimes', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['sometimes', 'date'],
        ];
    }
}
