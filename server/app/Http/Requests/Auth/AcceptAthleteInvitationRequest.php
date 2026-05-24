<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Rules\PasswordNotBreached;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * `POST /api/v1/athlete-invite/{token}/accept` (#445, M7 PR-C).
 *
 * Public endpoint — the token in the URL IS the auth. We don't gate
 * via `authorize()` here; the action validates the token. The
 * FormRequest carries only the password + the legal-acceptance
 * checkboxes that mirror the public `/auth/register` form.
 */
class AcceptAthleteInvitationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'password' => [
                'required',
                'string',
                // `max:255` (#1014) — bcrypt cost-12 hashing scales
                // linearly with input size; cap defends against
                // multi-MB password CPU-grind. Same rationale across
                // every FormRequest that hashes the value.
                'max:255',
                'confirmed',
                Password::min(8),
                // Same HIBP breach check as RegisterRequest /
                // ResetPasswordRequest / ChangePasswordRequest (#415).
                // The invite-accept flow IS the athlete's first
                // password choice, so a known-breached candidate must
                // be rejected here too for consistency.
                app(PasswordNotBreached::class),
            ],
            'accept_privacy' => ['required', 'accepted'],
            'accept_terms' => ['required', 'accepted'],
        ];
    }
}
