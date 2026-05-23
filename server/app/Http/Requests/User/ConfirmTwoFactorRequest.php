<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the step-2 TOTP confirmation on `POST /me/two-factor/confirm`
 *.
 *
 * The 6-digit TOTP code is the canonical "I have the authenticator
 * app on my device" proof. Size is exactly 6 chars — backup codes
 * (8-char `XXXX-XXXX`) are NOT accepted on this surface (they're for
 * the login fallback, not for enrolment confirmation).
 */
class ConfirmTwoFactorRequest extends FormRequest
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
            'code' => ['required', 'string', 'size:6'],
        ];
    }
}
