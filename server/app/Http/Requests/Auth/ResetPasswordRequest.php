<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:255'],
            'token' => ['required', 'string'],
            // Symmetric with RegisterRequest — a user must not be able to
            // weaken the registration policy by going through reset.
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }
}
