<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `PATCH /api/v1/me` (#463). The endpoint is auth:sanctum gated at
 * the route level; the FormRequest only validates the payload shape.
 *
 * Currently exposes only `name` — see `UpdateProfileAction` for the
 * scope split rationale.
 */
class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:255'],
        ];
    }
}
