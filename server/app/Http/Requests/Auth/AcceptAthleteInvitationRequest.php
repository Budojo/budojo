<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

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
                'confirmed',
                Password::min(8),
            ],
            'accept_privacy' => ['required', 'accepted'],
            'accept_terms' => ['required', 'accepted'],
        ];
    }
}
