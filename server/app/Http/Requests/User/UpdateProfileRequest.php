<?php

declare(strict_types=1);

namespace App\Http\Requests\User;

use App\Rules\HandleFormat;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `PATCH /api/v1/me` (#463 + #479). The endpoint is auth:sanctum gated
 * at the route level; the FormRequest only validates the payload shape.
 *
 * After #479 the editable surface is three fields:
 *
 * - `first_name` (required, 2-100 chars)
 * - `last_name`  (required, 2-100 chars — but note: a single-token
 *   migrated row may legitimately have an empty `last_name`. The user
 *   can fix it on next visit; the FormRequest still requires a value
 *   on every PATCH so we don't quietly persist empties from a UI bug.)
 * - `handle`     (nullable, IG-style format + globally unique)
 *
 * Email change happens via the dedicated `/me/email-change` flow
 * (#476), not through this endpoint.
 */
class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $userId = $this->user()?->id;

        return [
            'first_name' => ['required', 'string', 'min:2', 'max:100'],
            'last_name' => ['required', 'string', 'min:2', 'max:100'],
            'handle' => [
                // `bail` short-circuits on the FIRST failure so a non-
                // string payload doesn't fall through to `HandleFormat`
                // AND surface Laravel's default "must be a string"
                // message alongside our `handle_invalid_format` code.
                // The `string` rule is intentionally absent: HandleFormat
                // already checks `is_string` and emits the canonical
                // single failure code for every type / format violation.
                'bail',
                'nullable',
                new HandleFormat(),
                // Uniqueness is case-insensitive on the storage side
                // (handle is lowercased on save), but the validator
                // still needs an explicit ignore for the current user
                // so a no-op PATCH (handle unchanged) doesn't trip
                // the rule against itself.
                Rule::unique('users', 'handle')->ignore($userId),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'handle.unique' => 'handle_taken',
        ];
    }
}
