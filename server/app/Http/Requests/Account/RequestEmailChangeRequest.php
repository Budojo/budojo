<?php

declare(strict_types=1);

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `POST /api/v1/me/email-change` (#476). The endpoint is
 * `auth:sanctum` gated at the route level; the FormRequest only
 * validates the payload shape. Both owner + athlete personas use the
 * same surface — the action delegates to `RequestEmailChangeAction`
 * regardless of role — so the authorize gate is just "are you logged
 * in", which the auth middleware already enforced.
 */
class RequestEmailChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Same rule shape as `RegisterRequest::rules()['email']` (RFC
        // check only — no DNS / MX lookup, since CI / test envs run
        // offline). The cross-uniqueness check lives in the action
        // (`email_taken`) rather than here so a same-as-current
        // candidate can be rejected with a distinct `email_unchanged`
        // code.
        return [
            'email' => ['required', 'email', 'max:255'],
        ];
    }
}
