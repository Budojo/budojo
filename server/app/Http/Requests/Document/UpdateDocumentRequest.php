<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Authorization\Capability;
use App\Enums\DocumentType;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Document;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class UpdateDocumentRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    /**
     * Capability gate (`DocumentsUpload` in the document's athlete's
     * academy). Mirrors UploadDocumentRequest::authorize() so the
     * FormRequest owns the entire authorization contract — the
     * controller stays a humble orchestrator (server/CLAUDE.md
     * § Clean Architecture).
     */
    public function authorize(): bool
    {
        /** @var Document|null $document */
        $document = $this->route('document');
        if ($document === null) {
            return false;
        }

        $athlete = $document->athlete;
        if ($athlete === null) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::DocumentsUpload);
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

    /**
     * Match the wire-level contract used by the rest of the API for
     * ownership failures: `{"message":"Forbidden."}` with 403 — the exact
     * same JSON that DocumentController::download / destroy emit via
     * userOwns(). Without this override Laravel's default renderer would
     * emit `{"message":"This action is unauthorized."}` instead, breaking
     * a minor but real contract guarantee.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
