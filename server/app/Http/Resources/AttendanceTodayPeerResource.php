<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for one row in the "Chi viene stasera?" peer preview
 * (#958). Deliberately narrower than `AthleteResource`:
 *
 *  - `last_name_initial` (not full `last_name`) — defense-in-depth
 *    against shoulder-surfing the page in a public space.
 *  - No email, no fiscal code, no phone.
 *  - Avatar URL falls through to the User (if linked) — the academy's
 *    own user avatar pipeline is the canonical face.
 */
class AttendanceTodayPeerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Athlete $athlete */
        $athlete = $this->resource;
        $user = $athlete->user;

        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name_initial' => $athlete->last_name !== ''
                ? mb_strtoupper(mb_substr($athlete->last_name, 0, 1))
                : '',
            'handle' => $user?->handle,
            'belt' => $athlete->belt->value,
            'avatar_url' => $user?->avatar_url,
        ];
    }
}
