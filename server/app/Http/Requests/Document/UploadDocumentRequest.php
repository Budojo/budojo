<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Enums\DocumentType;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null || $user->academy === null) {
            return false;
        }

        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');

        return $athlete !== null && $athlete->academy_id === $user->academy->id;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::enum(DocumentType::class)],
            'file' => [
                'required',
                'file',
                'max:10240', // 10 MB, expressed in KB
                'mimetypes:application/pdf,image/jpeg,image/png',
            ],
            'issued_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after_or_equal:issued_at'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
