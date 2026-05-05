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
        // CTA without an extra request.
        //
        // The Resource itself stays passive: it READS the relation
        // and never issues its own query. All three callers (the
        // login + register + /me controllers) explicitly call
        // `$user->load('pendingDeletion')` before constructing this
        // Resource, so the `relationLoaded` check below is a defensive
        // guard against future call sites that forget the load —
        // `null` is a safer default than a silent N+1. (Incident
        // #255 caught the missing loads on login + register.)
        $pending = $user->relationLoaded('pendingDeletion')
            ? $user->pendingDeletion
            : null;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            // Avatar (#411). Always emit the FULL URL, never the on-disk
            // path — the Resource is the API boundary, downstream consumers
            // never reconstruct paths. The accessor on the User model
            // resolves through `Storage::disk('public')->url(...)`; null
            // when the user hasn't uploaded one yet (initials fallback in
            // the SPA).
            'avatar_url' => $user->avatar_url,
            'deletion_pending' => $pending === null ? null : [
                'requested_at' => $pending->requested_at->toIso8601String(),
                'scheduled_for' => $pending->scheduled_for->toIso8601String(),
            ],
        ];
    }
}
