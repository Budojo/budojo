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
        return [
            // `email:rfc,dns` mirrors the registration policy — RFC
            // syntax + an MX lookup. The DNS check catches the most
            // common typo class (`gmial.com`) at form-submit time
            // rather than at queue-dispatch time, where a 422 is the
            // SPA's only recourse.
            'email' => ['required', 'email:rfc,dns', 'max:255'],
        ];
    }
}
