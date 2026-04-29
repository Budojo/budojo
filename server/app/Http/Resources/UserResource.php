<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        // GDPR Art. 17 — surfaces a non-null deletion_pending block
        // when the user is in the 30-day grace window (#223), so the
        // SPA can render the warning banner + the "cancel deletion"
        // CTA without an extra request. Eager-loaded when available
        // upstream; otherwise a single extra query is fine here, the
        // /auth/me endpoint is hit once on bootstrap.
        $pending = $user->relationLoaded('pendingDeletion')
            ? $user->pendingDeletion
            : $user->pendingDeletion()->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'deletion_pending' => $pending === null ? null : [
                'requested_at' => $pending->requested_at->toIso8601String(),
                'scheduled_for' => $pending->scheduled_for->toIso8601String(),
            ],
        ];
    }
}
