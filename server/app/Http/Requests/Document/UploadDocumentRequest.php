<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Enums\DocumentType;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
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

    /**
     * Match the wire-level contract used by the rest of the API for
     * ownership failures: `{"message":"Forbidden."}` with 403. Without
     * this override Laravel's default renderer would emit
     * `{"message":"This action is unauthorized."}`, breaking the
     * uniformity with DocumentController::download / destroy and with
     * UpdateDocumentRequest.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
