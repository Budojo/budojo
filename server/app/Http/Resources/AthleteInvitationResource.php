<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AthleteInvitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for an `AthleteInvitation` row (#445, M7 PR-B).
 *
 * The token column is INTENTIONALLY omitted — the column stores the
 * SHA-256 hash and emitting that to the SPA gives nothing actionable
 * (the action that needs the raw at accept time gets it from the URL,
 * not from this resource). Preserving "tokens never leave the row"
 * keeps the boundary clean.
 *
 * @mixin AthleteInvitation
 */
class AthleteInvitationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'athlete_id' => $this->athlete_id,
            'email' => $this->email,
            'expires_at' => $this->expires_at->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
            // Derived state — handy for the SPA chip rendering. Mutually
            // exclusive on the model side.
            'state' => match (true) {
                $this->isAccepted() => 'accepted',
                $this->isRevoked() => 'revoked',
                $this->isExpired() => 'expired',
                default => 'pending',
            },
        ];
    }
}
