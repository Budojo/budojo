<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Academy;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

class AcademyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Academy $academy */
        $academy = $this->resource;

        // Lazy access — `$academy->address` triggers the morph relation
        // load on first read. For show / update endpoints that's a single
        // extra query; for list endpoints we'd want explicit eager loading,
        // but academy is always a single-row resource (per-tenant), so the
        // N+1 surface is zero.
        $address = $academy->address;

        return [
            'id' => $academy->id,
            'name' => $academy->name,
            'slug' => $academy->slug,
            // Phone (#161) — same shape as AthleteResource. Both fields null
            // OR both filled by the schema's `required_with` rule.
            'phone_country_code' => $academy->phone_country_code,
            'phone_national_number' => $academy->phone_national_number,
            // Contact links (#162) — flat URL columns, each independently
            // nullable. The SPA renders icons that link out when present.
            'website' => $academy->website,
            'facebook' => $academy->facebook,
            'instagram' => $academy->instagram,
            'address' => $address !== null ? new AddressResource($address)->toArray($request) : null,
            'logo_url' => $academy->logo_path !== null
                ? Storage::disk('public')->url($academy->logo_path)
                : null,
            'monthly_fee_cents' => $academy->monthly_fee_cents,
            // How many price tiers the academy has (#1381). The SPA gates the
            // paid badge and the unpaid widget on "does this academy manage
            // payments at all", which used to be the same question as
            // `monthly_fee_cents !== null` and is not any more: an academy
            // priced only by tier leaves the flat fee empty. Counted rather
            // than embedded — the list itself has its own endpoint, and the
            // callers here only need to know whether it is empty.
            'fee_tier_count' => $academy->feeTiers()->count(),
            'carnet_price_cents' => $academy->carnet_price_cents,
            'carnet_entries' => $academy->carnet_entries,
            'training_days' => $academy->training_days,
            // The training year (#1484). Three fields for one setting,
            // because the SPA needs different halves of it in different
            // places: the raw month to put back in the settings form, and the
            // resolved boundary + label to explain a roster number that is
            // now scoped to a year rather than to forever. Resolving it here
            // rather than in the client keeps one definition of where a
            // season starts — the client re-deriving it from the month would
            // be a second implementation of the same off-by-one.
            'season_start_month' => $academy->season_start_month,
            'season_start' => Season::startFor($academy, CarbonImmutable::now())->toDateString(),
            'season_label' => Season::labelFor($academy, CarbonImmutable::now()),
            // Schedule history (#1094). Pull the full history once,
            // then derive current/next from the in-memory collection —
            // 1 query instead of separate `currentSchedule()` /
            // `nextSchedule()` round-trips that would each re-issue
            // their own SELECT (and we'd call each twice, once for the
            // null-check and once for the Resource argument — five
            // queries vs. one). `current_schedule` and `next_schedule`
            // are also now byte-for-byte identical to entries in
            // `schedules`, no two-source-of-truth risk.
            ...$this->schedulePayload($academy, $request),
        ];
    }

    /**
     * Derives `schedules` / `current_schedule` / `next_schedule` from a
     * single ordered fetch. The list is DESC by `effective_from`, so:
     *   - first row with `effective_from <= today` → current
     *   - last row with `effective_from >  today` → next
     *     (last-in-DESC-order is the smallest `effective_from` among
     *     the futures — i.e. the soonest one)
     *
     * @return array<string, mixed>
     */
    private function schedulePayload(Academy $academy, Request $request): array
    {
        $today = Carbon::today();

        $schedules = $academy->schedules()
            ->orderByDesc('effective_from')
            ->get();

        $current = $schedules->first(
            static fn ($s): bool => $s->effective_from->lessThanOrEqualTo($today),
        );
        $next = $schedules->last(
            static fn ($s): bool => $s->effective_from->greaterThan($today),
        );

        return [
            'current_schedule' => $current !== null
                ? new AcademyScheduleResource($current)->toArray($request)
                : null,
            'next_schedule' => $next !== null
                ? new AcademyScheduleResource($next)->toArray($request)
                : null,
            'schedules' => $schedules
                ->map(fn ($s) => new AcademyScheduleResource($s)->toArray($request))
                ->all(),
        ];
    }
}
