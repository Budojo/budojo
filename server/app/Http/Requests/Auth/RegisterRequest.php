<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
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
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            // Terms of Service acceptance gate (#420). Laravel's
            // `accepted` rule rejects falsy values (false, 0, "0",
            // null, empty string, missing) AND requires one of the
            // truthy markers (true, 1, "1", "true", "on", "yes") —
            // matches the SPA's `Validators.requiredTrue` semantics
            // and prevents a malicious client from POSTing without
            // the field at all.
            'terms_accepted' => ['required', 'accepted'],
        ];
    }
}
