<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the password re-auth gate on `DELETE /me/two-factor`
 *.
 *
 * Disabling 2FA is a high-risk operation — the user must re-prove
 * the password to suppress a CSRF / session-takeover path from
 * silently removing the second factor. The check happens after this
 * validation in the controller (Hash::check against the user row).
 */
class DisableTwoFactorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string'],
        ];
    }
}
