<?php

declare(strict_types=1);

namespace App\Models;

use App\Contracts\HasAddress;
use App\Observers\AcademyObserver;
use App\Observers\Audit\AcademyAuditObserver;
use Database\Factories\AcademyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Support\Carbon;

/**
 * @property int                 $id
 * @property int                 $user_id
 * @property string              $name
 * @property string|null         $phone_country_code     E.164 prefix incl. `+`, e.g. `+39`. Pair with `phone_national_number` (#161). Both columns null OR both filled.
 * @property string|null         $phone_national_number  Unformatted national digits, e.g. `3331234567`.
 * @property string|null         $website               Full URL incl. scheme, e.g. `https://gracie-barra.com` (#162).
 * @property string|null         $facebook              Full Facebook page URL.
 * @property string|null         $instagram             Full Instagram profile URL.
 * @property string              $slug
 * @property string|null         $logo_path
 * @property int|null            $season_start_month     Month the training year begins, 1-12 (#1484). Null means nobody chose — resolve it through App\Support\Season, never raw.
 * @property int|null            $monthly_fee_cents
 * @property int|null            $carnet_price_cents
 * @property int|null            $carnet_entries
 * @property list<int>|null      $training_days  Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured"
 */
#[Fillable(['user_id', 'name', 'phone_country_code', 'phone_national_number', 'website', 'facebook', 'instagram', 'slug', 'logo_path', 'monthly_fee_cents', 'carnet_price_cents', 'carnet_entries', 'training_days', 'season_start_month'])]
#[ObservedBy([AcademyObserver::class, AcademyAuditObserver::class])]
class Academy extends Model implements HasAddress
{
    /** @use HasFactory<AcademyFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * The academy's price list (#1381). Empty on an academy that charges one
     * flat fee, which is what `monthly_fee_cents` is for.
     *
     * @return HasMany<AcademyFeeTier, $this>
     */
    public function feeTiers(): HasMany
    {
        return $this->hasMany(AcademyFeeTier::class);
    }

    /**
     * Academies that manage payments in Budojo at all (#1381).
     *
     * Before the price list existed this was simply `monthly_fee_cents IS NOT
     * NULL`, and the two statements were the same thing. They no longer are:
     * an academy that prices only by tier leaves the flat fee empty and would
     * drop out of every fee-gated query while plainly charging its athletes.
     *
     * Zero counts as configured on purpose — an academy that has deliberately
     * set the fee to nothing is still managing payments here, and its unpaid
     * list is still meaningful.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeChargingAFee(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNotNull('monthly_fee_cents')
            ->orHas('feeTiers'));
    }

    /**
     * Academies where somebody actually owes money (#1381).
     *
     * Narrower than `chargingAFee` and deliberately kept apart from it: a fee
     * of zero means nothing is owed, so chasing an athlete for it would be
     * noise. The two predicates answer different questions and collapsing
     * them would silently change one of the two callers.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeChargingMoreThanNothing(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where('monthly_fee_cents', '>', 0)
            ->orWhereHas('feeTiers', fn (Builder $tiers) => $tiers->where('amount_cents', '>', 0)));
    }

    /** @return HasMany<Athlete, $this> */
    public function athletes(): HasMany
    {
        return $this->hasMany(Athlete::class);
    }

    /**
     * Team memberships (#427 / #714). Includes soft-revoked rows;
     * use `->whereNull('revoked_at')` to scope to currently-active
     * team members.
     *
     * @return HasMany<AcademyMembership, $this>
     */
    public function memberships(): HasMany
    {
        return $this->hasMany(AcademyMembership::class);
    }

    /**
     * Pending invitations (#427 / #714). Rows here are by definition
     * not-yet-accepted and not-revoked — terminal state hard-deletes
     * the row.
     *
     * @return HasMany<AcademyInvitation, $this>
     */
    public function invitations(): HasMany
    {
        return $this->hasMany(AcademyInvitation::class);
    }

    /**
     * Polymorphic address (#72). `morphOne` is a READ-side convenience —
     * Eloquent returns the first matching row but does not enforce that
     * only one exists. The 1:1 invariant is enforced by:
     *
     *   1. A UNIQUE index on `(addressable_type, addressable_id)` in the
     *      `addresses` table (see `create_addresses_table` migration).
     *   2. `SyncAddressAction` going through this relation's
     *      `updateOrCreate(...)` so concurrent inserts hit the constraint
     *      instead of silently producing duplicate rows.
     *
     * Always mutate the address through `SyncAddressAction`, never
     * by `new Address()->save()` against this relation directly.
     *
     * @return MorphOne<Address, $this>
     */
    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    /**
     * Schedule history (#1094). One row per "this is the schedule
     * starting on this date" event, ordered by `effective_from`. Reads
     * for any past or future date resolve through `scheduleForDate()` —
     * never iterate this relation directly outside resource shaping.
     *
     * @return HasMany<AcademySchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(AcademySchedule::class);
    }

    /**
     * The schedule effective on a given date — the row with the largest
     * `effective_from <= $date` (#1094). Returns null when no row
     * covers the date (post-backfill that means the date is before
     * the academy's birthday — practically never).
     */
    public function scheduleForDate(Carbon $date): ?AcademySchedule
    {
        return $this->schedules()
            ->where('effective_from', '<=', $date->toDateString())
            ->orderByDesc('effective_from')
            ->first();
    }

    /** Schedule in effect right now — convenience for today's lookup. */
    public function currentSchedule(): ?AcademySchedule
    {
        return $this->scheduleForDate(Carbon::today());
    }

    /**
     * The pending future schedule, if the owner has scheduled one. By
     * application invariant (enforced in the upcoming Schedule FormRequests
     * — PR 2), at most one such row exists at a time. This helper just
     * returns the soonest `effective_from > today` row.
     */
    public function nextSchedule(): ?AcademySchedule
    {
        return $this->schedules()
            ->where('effective_from', '>', Carbon::today()->toDateString())
            ->orderBy('effective_from')
            ->first();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'training_days' => 'array',
            'season_start_month' => 'integer',
        ];
    }
}
