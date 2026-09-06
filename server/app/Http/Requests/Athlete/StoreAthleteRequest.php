<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use App\Http\Requests\Concerns\ValidatesStripesAgainstBelt;
use App\Support\AthleteFieldRules;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreAthleteRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesAddress;
    use ValidatesPhonePair;
    use ValidatesStripesAgainstBelt;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // Use activeAcademyId() — same helper backing the
        // authorize() check — so the fallback to first-active-
        // membership for users with null pointer also reaches the
        // unique-email scope here. Otherwise duplicates in the
        // resolved academy would slip past validation.
        $academyId = $this->user()?->activeAcademyId();

        return [
            // One definition of "a valid athlete", shared with the CSV import
            // (#1346) so a rule added here cannot silently skip the path that
            // creates sixty records at once.
            ...AthleteFieldRules::for($academyId),
            ...$this->addressRules(),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
        $this->validateStripesAgainstBelt($validator);
    }

    /**
     * Match the canonical wire-level 403 contract used by every other write
     * FormRequest (UpdateAcademyRequest, UpdateDocumentRequest,
     * MarkAttendanceRequest): `{"message":"Forbidden."}`. Without this
     * override, Laravel falls back to "This action is unauthorized.", which
     * mismatches both the OpenAPI spec (`ForbiddenAthleteWrite`) and the SPA's
     * 403 handling.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
