<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorization + payload validation for
 * `POST /api/v1/athletes/{athlete}/email` (#476).
 *
 * Capability gate (`AthletesCreateUpdate` in the athlete's academy)
 * replaces the legacy `isOwner()` + active-academy check. Owners and
 * Admins can change an athlete's email; Instructors can (it's part of
 * record-keeping in the PRD); Assistants cannot.
 */
class ChangeAthleteEmailRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Same rule shape as `RegisterRequest` and the matching
        // `RequestEmailChangeRequest` for the owner self-edit — RFC
        // check only, no offline-hostile DNS lookup.
        return [
            'email' => ['required', 'email', 'max:255'],
        ];
    }
}
