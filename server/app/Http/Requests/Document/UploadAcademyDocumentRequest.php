<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Authorization\Capability;
use App\Enums\DocumentType;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * Uploading one of the academy's own papers (#1743).
 *
 * A sibling of `UploadDocumentRequest` rather than a widening of it: that one
 * authorises against an `Athlete` bound on the route, and this one has no
 * route parameter at all — the academy is the caller's active one. The rules
 * are the same because the file contract is the same; the authorisation is
 * different because the subject is.
 */
class UploadAcademyDocumentRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        /** @var \App\Models\User|null $user */
        $user = $this->user();
        $academyId = $user?->activeAcademyId();
        if ($academyId === null) {
            return false;
        }

        // The same capability the per-athlete upload requires. Who may attach
        // a paper to the academy is not a softer question than who may attach
        // one to an athlete.
        return $this->authorizeInAcademy($academyId, Capability::DocumentsUpload);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // `medical_certificate` is refused here (#1743). It is the one
            // type that is special-category data under GDPR Art. 9, it is the
            // one type `UploadDocumentAction` encrypts, and an academy does
            // not have a medical fitness certificate — a person does. Letting
            // it through would put ciphertext behind a key that backups
            // deliberately do not carry, attached to a row nobody can read
            // back as a person's health record.
            'type' => [
                'required',
                Rule::enum(DocumentType::class),
                Rule::notIn([DocumentType::MedicalCertificate->value]),
            ],
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
     * Same wire-level contract as every other ownership failure in the API:
     * `{"message":"Forbidden."}` with 403, not Laravel's default renderer.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
