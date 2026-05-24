<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
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
            'email' => ['required', 'email'],
            // Cap at 255 chars (#1013) — bcrypt cost-12 hashing time
            // scales linearly with input size; without an upper bound
            // an attacker can POST a multi-MB password and CPU-grind
            // the hash check per request. 255 is far above any
            // plausible real password.
            'password' => ['required', 'string', 'max:255'],
            // Optional — only required when the user has 2FA active.
            // Either a 6-digit TOTP from the authenticator app, or
            // an 8-char backup code with the `XXXX-XXXX` dash. The
            // controller distinguishes shape and consumes
            // accordingly. Loose validation here so an invalid code
            // gets the precise 422 from the controller (not a generic
            // shape error from the form).
            'two_factor_code' => ['sometimes', 'string', 'min:6', 'max:32'],
        ];
    }
}
