<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use App\Support\OnboardingStep;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CompleteOnboardingStepRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<string|\Illuminate\Validation\Rules\In>>
     */
    public function rules(): array
    {
        return [
            'step' => ['required', 'string', Rule::in(OnboardingStep::all())],
        ];
    }
}
