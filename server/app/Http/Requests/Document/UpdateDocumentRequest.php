<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Enums\DocumentType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * Only metadata is updateable via PUT. `file`, `file_path`, and
     * `athlete_id` are intentionally NOT in the rules — Laravel's default
     * `validated()` excludes any key without a validation rule, so those
     * fields cannot reach `$document->update($request->validated())`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['sometimes', Rule::enum(DocumentType::class)],
            'issued_at' => ['sometimes', 'nullable', 'date'],
            'expires_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:issued_at'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
