<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\Athlete;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorization gate for `POST /api/v1/athletes/{athlete}/invite[/resend]`
 * and `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` (#445, M7 PR-B).
 *
 * No body — the request carries no user-supplied fields. Capability
 * gate (`AthletesCreateUpdate` in the athlete's academy) replaces the
 * legacy `isOwner()` + same-academy ID check. Per
 * `RoleCapabilities::MATRIX`: Owner/Admin/Instructor can invite an
 * athlete; Assistant cannot.
 */
class InviteAthleteRequest extends FormRequest
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
        return [];
    }
}
