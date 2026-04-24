<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateAcademyRequest extends FormRequest
{
    /**
     * Ownership gate: the authenticated user must own an academy.
     * Mirrors UpdateDocumentRequest::authorize() so the FormRequest owns
     * the entire authorization contract — the controller stays a humble
     * orchestrator (server/CLAUDE.md § Clean Architecture).
     *
     * `slug` is intentionally immutable by design (keeps permalinks stable
     * across renames) and therefore absent from the rules below.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * Only `name` and `address` are updateable. `slug` is immutable; `user_id`
     * is set at creation. Laravel's `validated()` excludes any key without
     * a rule, so those fields cannot reach `$academy->update($validated)`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    /**
     * Match the wire-level contract used by the rest of the API for
     * ownership failures: `{"message":"Forbidden."}` with 403 — same JSON
     * that DocumentController / UpdateDocumentRequest emit. Without this
     * override Laravel would render "This action is unauthorized." and
     * break the contract.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
