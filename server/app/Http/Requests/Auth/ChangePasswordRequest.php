<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Re-auth gate for an in-app password change (#409). The user is
 * already authenticated via Sanctum to even reach the route; we ask
 * for the current password again so a hijacked token alone cannot
 * rotate the credential, and we reject a no-op rotation (new == old)
 * so a forgetful user is told they didn't actually change anything.
 *
 * Password policy mirrors `RegisterRequest` + `ResetPasswordRequest`
 * exactly — `min:8` + `confirmed`. Rotating credentials must NOT let
 * the user weaken the registration policy.
 */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'current_password' => [
                'required',
                'string',
                // The current-password closure rule is the single
                // re-auth gate. Hash::check against the authenticated
                // user's stored hash; a mismatch surfaces as a 422 on
                // `current_password` (NOT `password`) so the SPA can
                // render the error inline under the right field.
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $user = $this->user();
                    if ($user === null || ! \is_string($value) || ! Hash::check($value, $user->password)) {
                        $fail('The current password is incorrect.');
                    }
                },
            ],
            'password' => [
                'required',
                'string',
                'min:8',
                'confirmed',
                // New password must differ from the current one (#409).
                // Without this gate a user could "change" their password
                // to itself and be told it succeeded — confusing UX, and
                // pointless from the rotate-credentials standpoint that
                // motivates the feature.
                Rule::notIn([$this->input('current_password')]),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'password.not_in' => 'The new password must be different from the current one.',
        ];
    }
}
