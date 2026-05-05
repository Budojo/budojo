<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorization gate for `POST /api/v1/athletes/{athlete}/invite[/resend]`
 * and `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` (#445, M7 PR-B).
 *
 * No body — the request carries no user-supplied fields. The athlete
 * email + the academy scoping live on the route-bound model. We only
 * authorise: caller must be the authenticated owner of the athlete's
 * academy AND must have `role = owner`.
 */
class InviteAthleteRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null || ! $user->isOwner()) {
            return false;
        }

        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        // Ownership check: the authenticated user must own the
        // athlete's academy. `User::academy()` is HasOne; ID compare.
        return $user->academy?->id === $athlete->academy_id;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
