<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorization + payload validation for
 * `POST /api/v1/athletes/{athlete}/email` (#476).
 *
 * Mirrors `InviteAthleteRequest`'s authorize() shape: the caller must
 * be a logged-in `role=owner` user AND must own the academy the
 * route-bound athlete belongs to. Athletes (`role=athlete`) and the
 * owners of OTHER academies are denied at this layer with a 403
 * before the action runs — defense in depth, the action itself does
 * not re-check tenant scoping.
 */
class ChangeAthleteEmailRequest extends FormRequest
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

        return $user->academy?->id === $athlete->academy_id;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc,dns', 'max:255'],
        ];
    }
}
