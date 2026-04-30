<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Re-auth gate for the GDPR Art. 17 deletion flow (#223). The user is
 * already authenticated via Sanctum to even reach the route — we ask
 * for the password again because the action is irreversible after the
 * 30-day grace window. Same shape as a "delete account" confirmation
 * UX every other SaaS shows.
 */
class RequestAccountDeletionRequest extends FormRequest
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
