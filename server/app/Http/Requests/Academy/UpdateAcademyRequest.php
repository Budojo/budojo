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
            // Cents — `integer` rejects "9.5" / floats; `min:0` blocks
            // negatives (refunds/discounts would be a different concept).
            // No upper bound — let the academy own the absurdity check.
            'monthly_fee_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            // Carbon dayOfWeek convention (0=Sun..6=Sat). See StoreAcademyRequest
            // for the same shape — kept in sync because both endpoints feed
            // the same column on the model.
            'training_days' => ['sometimes', 'nullable', 'array', 'max:7'],
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],
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
