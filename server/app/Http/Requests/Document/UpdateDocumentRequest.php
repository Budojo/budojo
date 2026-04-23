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

    /**
     * @return array<string, mixed>
     */
    public function validated($key = null, $default = null): array
    {
        // Whitelist: the file cannot be replaced via PUT — clients must upload a
        // brand new document row instead. We also strip athlete_id and any
        // accidental file_path from the validated payload before it reaches
        // the model ->update() call.
        /** @var array<string, mixed> $data */
        $data = parent::validated();
        unset($data['file'], $data['file_path'], $data['athlete_id']);

        return $data;
    }
}
