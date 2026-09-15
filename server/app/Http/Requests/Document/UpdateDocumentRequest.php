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

        // Through the athlete, or directly on the academy (#1743) — one
        // accessor, so a new kind of document cannot acquire a fifth copy of
        // the scoping rule that quietly disagrees with the other four.
        $academyId = $document->owningAcademyId();
        if ($academyId === null) {
            return false;
        }

        return $this->authorizeInAcademy($academyId, Capability::DocumentsUpload);
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
        /** @var \App\Models\Document|null $document */
        $document = $this->route('document');

        return [
            'type' => [
                'sometimes',
                Rule::enum(DocumentType::class),
                // An academy paper cannot be RETYPED into a medical
                // certificate (#1743). Upload already refuses it, but refusing
                // it only at upload leaves a back door with teeth: the row
                // would then match `PurgeExpiredMedicalCertificates`, which
                // after 24 months soft-deletes it and **wipes the file** — so
                // a mistyped liability policy would quietly destroy itself.
                // It is also the one type that is special-category data, and
                // its bytes would still be plaintext, since encryption happens
                // at upload and `PUT` cannot re-write a file.
                Rule::when(
                    $document?->academy_id !== null,
                    [Rule::notIn([DocumentType::MedicalCertificate->value])],
                ),
            ],
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
