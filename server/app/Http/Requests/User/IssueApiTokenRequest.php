<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use App\Support\ApiTokenAbility;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IssueApiTokenRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:100'],
            'abilities' => ['required', 'array', 'min:1'],
            'abilities.*' => ['string', Rule::in(ApiTokenAbility::all())],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:730'],
        ];
    }
}
