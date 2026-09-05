<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\Carnet;
use App\Support\CarnetAvailability;
use App\Support\MonthlyFee;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AthleteResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Athlete $athlete */
        $athlete = $this->resource;

        $year = (int) now()->year;
        $month = (int) now()->month;

        // Two paths so we don't pull every payment row into memory just to
        // compute a boolean:
        //   * INDEX endpoint: AthleteController::index pre-loads only the
        //     current-month slice (no N+1) — we filter the in-memory
        //     collection.
        //   * SHOW / STORE / UPDATE: relationship is NOT pre-loaded — we
        //     issue a constrained `exists()` query that returns a single
        //     bool without hydrating models.
        $paidCurrentMonth = $athlete->relationLoaded('payments')
            ? $athlete->payments
                ->where('year', $year)
                ->where('month', $month)
                ->isNotEmpty()
            : $athlete->payments()
                ->where('year', $year)
                ->where('month', $month)
                ->exists();

        // Carnet balance chip (#1364) — same two-path shape as
        // `paid_current_month` right above: the index endpoint pre-loads the
        // validity-window slice, single-row endpoints query on demand. Either
        // way the balance half of "is it spendable" is applied in memory by
        // `CarnetAvailability`, which is the one place that rule lives.
        $today = CarbonImmutable::today();
        $activeCarnet = ($athlete->relationLoaded('carnets')
            ? $athlete->carnets
            : $athlete->carnets()->validOn($today)->get())
            ->first(static fn (Carnet $c): bool => CarnetAvailability::isActiveOn($c, $today));

        // Address (#72b) — same lazy-access pattern as AcademyResource.
        // The list endpoint at AthleteController::index eager-loads
        // `address` via `->with('address')` so the 20-row page resolves
        // in one extra query instead of N+1; single-row endpoints
        // (show / store / update) hydrate the relation on demand.
        $address = $athlete->address;

        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name' => $athlete->last_name,
            'email' => $athlete->email,
            'phone_country_code' => $athlete->phone_country_code,
            'phone_national_number' => $athlete->phone_national_number,
            // Contact links (#162) — flat URL columns, each independently
            // nullable. Same shape as the academy resource.
            'website' => $athlete->website,
            'facebook' => $athlete->facebook,
            'instagram' => $athlete->instagram,
            'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'status' => $athlete->status->value,
            // Owner-as-athlete flag (#748). The SPA uses this to:
            //   - render an `Owner` chip next to the name on the roster,
            //   - hide the payment column on this row,
            //   - replace the regular `Delete athlete` CTA with the
            //     "Leave from your Profile" affordance.
            'is_self' => $athlete->is_self,
            // Linked-user public handle — exposed for the athletes-list
            // public-profile affordance (post-v2.22.1). Null when the
            // athlete row hasn't been linked to a user yet, OR when the
            // linked user hasn't set a handle. The SPA shows the
            // "view public profile" icon only when this is non-null.
            'user_handle' => $athlete->user?->handle,
            // Linked-user avatar URL — drives the athletes-list avatar
            // affordance (#983). Null when the athlete row has no
            // linked user yet OR the user hasn't uploaded an avatar.
            // The SPA falls back to a `pi pi-user` placeholder circle.
            'user_avatar_url' => $athlete->user?->avatar_url,
            // The athlete's OWN photo (#1357), independent of any linked user
            // account — which is the point: `athlete_accounts` is absent from
            // the desktop runtime, so before this an athlete on the shipped
            // build could never have a picture at all. The SPA prefers this
            // over `user_avatar_url` and falls back to the initials circle.
            'photo_url' => $athlete->photo_url,
            'joined_at' => $athlete->joined_at->toDateString(),
            'address' => $address !== null ? new AddressResource($address)->toArray($request) : null,
            'created_at' => $athlete->created_at?->toIso8601String(),
            'paid_current_month' => $paidCurrentMonth,
            // Which line of the price list this athlete is on (#1381), and the
            // amount that actually applies to them — resolved server-side so
            // the SPA never has to re-derive "tier, or academy fallback".
            'fee_tier' => $athlete->feeTier === null ? null : [
                'id' => $athlete->feeTier->id,
                'label' => $athlete->feeTier->label,
                'amount_cents' => $athlete->feeTier->amount_cents,
                'lessons_per_week' => $athlete->feeTier->lessons_per_week,
            ],
            'monthly_fee_cents' => MonthlyFee::forAthlete($athlete),
            // Null when the athlete holds no spendable carnet — the roster
            // chip and the athlete-detail header render from this without a
            // per-row call.
            'active_carnet' => $activeCarnet === null ? null : [
                'id' => $activeCarnet->id,
                'code' => $activeCarnet->code,
                'remaining_entries' => CarnetAvailability::remainingEntries($activeCarnet),
                'expires_at' => $activeCarnet->expires_at->toDateString(),
            ],
            // M7 PR-B-UI (#467) — the single invitation block the SPA's
            // athlete-detail card renders. Read-side projection only;
            // the raw token + sha-256 hash never leave the database.
            // Null on the index endpoint (relation not loaded) AND on
            // show when there is no active (pending or accepted) row.
            'invitation' => $athlete->relationLoaded('latestActiveInvitation')
                ? $this->buildInvitationBlock($athlete->latestActiveInvitation)
                : null,
        ];
    }

    /**
     * Wire-shape of the invitation block (#467). Returns null when
     * there's no active row. Otherwise carries:
     *
     * - `state` — `pending` while still consumable, `accepted` once
     *   the athlete redeemed the link. Revoked + expired never
     *   surface (`Athlete::latestActiveInvitation` filters them out).
     * - `sent_at` — `last_sent_at` (the resend-aware "when the user
     *   actually got the most recent email"), falling back to
     *   `created_at` for legacy rows where `last_sent_at` is null.
     * - `expires_at` — when the link stops working. Always present so
     *   the SPA can render a countdown chip without a null-guard.
     * - `accepted_at` — set on accepted rows; null on pending.
     *
     * @return array<string, mixed>|null
     */
    private function buildInvitationBlock(?AthleteInvitation $invitation): ?array
    {
        if ($invitation === null) {
            return null;
        }

        // `created_at` is the non-null fallback when `last_sent_at` is
        // missing on a legacy row, so the `??` chain narrows to a
        // non-nullable Carbon — no nullsafe operator needed.
        $sentAt = $invitation->last_sent_at ?? $invitation->created_at;

        return [
            'id' => $invitation->id,
            'state' => $invitation->isAccepted() ? 'accepted' : 'pending',
            'sent_at' => $sentAt->toIso8601String(),
            'expires_at' => $invitation->expires_at->toIso8601String(),
            'accepted_at' => $invitation->accepted_at?->toIso8601String(),
        ];
    }
}
