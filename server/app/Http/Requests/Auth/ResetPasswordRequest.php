<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Rules\PasswordNotBreached;
use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:255'],
            'token' => ['required', 'string'],
            // Symmetric with RegisterRequest — a user must not be able to
            // weaken the registration policy by going through reset. The
            // HIBP breach check (#415) is included here too: reset is the
            // primary path through which a user picks a new password,
            // and it would be inconsistent to enforce on register but
            // skip on reset. `max:255` (#1014) closes the bcrypt-DoS
            // surface — same rationale as RegisterRequest.
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed', app(PasswordNotBreached::class)],
        ];
    }
}
