<?php

declare(strict_types=1);

namespace App\Models;

use App\Contracts\HasAddress;
use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Observers\AthleteObserver;
use App\Observers\Audit\AthleteAuditObserver;
use Database\Factories\AthleteFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

/**
 * @property int                     $id
 * @property int                     $academy_id
 * @property int|null                $fee_tier_id
 * @property int                     $billing_period_months
 * @property int|null                $user_id                M7 athlete-login link (#445). Null until the athlete accepts the invite; non-null afterwards.
 * @property bool                    $is_self                Owner-as-athlete row marker (#748) — see class doc.
 * @property string                  $first_name
 * @property string                  $last_name
 * @property string|null             $email
 * @property string|null             $phone_country_code     E.164 prefix incl. `+`, e.g. `+39`. Pair with `phone_national_number` (#75).
 * @property string|null             $phone_national_number  Unformatted national digits, e.g. `3331234567`. Both columns null OR both filled.
 * @property string|null             $website                Full URL incl. scheme (#162).
 * @property string|null             $facebook               Full Facebook profile URL.
 * @property string|null             $instagram              Full Instagram profile URL.
 * @property \Carbon\Carbon|null     $date_of_birth
 * @property Belt                    $belt
 * @property int                     $stripes
 * @property AthleteStatus           $status
 * @property \Carbon\Carbon          $joined_at
 * @property \Carbon\Carbon|null     $created_at
 * @property \Carbon\Carbon|null     $updated_at
 * @property \Carbon\Carbon|null     $deleted_at
 */
#[Fillable(['academy_id', 'fee_tier_id', 'billing_period_months', 'user_id', 'is_self', 'first_name', 'last_name', 'email', 'phone_country_code', 'phone_national_number', 'website', 'facebook', 'instagram', 'date_of_birth', 'belt', 'stripes', 'status', 'joined_at'])]
#[ObservedBy([AthleteObserver::class, AthleteAuditObserver::class])]
class Athlete extends Model implements HasAddress
{
    /** @use HasFactory<AthleteFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /**
     * The User account this athlete is logged in as (#445). Null
     * until the athlete accepts the owner's invite (M7 PR-C).
     *
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Every invitation row ever generated for this athlete. The
     * pending one (if any) is `->invitations()->pending()->first()`
     * via the scope on AthleteInvitation. History rows
     * (revoked / expired / accepted) stay around as audit trail.
     *
     * @return HasMany<AthleteInvitation, $this>
     */
    public function invitations(): HasMany
    {
        return $this->hasMany(AthleteInvitation::class);
    }

    /**
     * The single invitation row the SPA renders on athlete detail (#467
     * / M7 PR-B-UI). Picks the most recent **pending or accepted** row;
     * revoked + expired audit rows stay in `invitations()` but are
     * deliberately invisible to the SPA — the owner re-invites by
     * sending a new invite, not by reviewing terminal history.
     *
     * Implemented as a `HasOne` so the controller can `->load('latestActiveInvitation')`
     * and the resource can read the relation without issuing its own
     * query — keeps the show endpoint at one round-trip even when the
     * relation is evaluated.
     *
     * @return HasOne<AthleteInvitation, $this>
     */
    public function latestActiveInvitation(): HasOne
    {
        return $this->hasOne(AthleteInvitation::class)
            ->where(function ($query): void {
                // Accepted rows live forever (status: "registered athlete").
                $query->whereNotNull('accepted_at')
                    // OR a non-terminal pending row (mirrors AthleteInvitation::scopePending).
                    ->orWhere(function ($pending): void {
                        $pending->whereNull('accepted_at')
                            ->whereNull('revoked_at')
                            ->where('expires_at', '>', now());
                    });
            })
            ->latestOfMany();
    }

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /** @return HasMany<AttendanceRecord, $this> */
    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    /** @return HasMany<AthletePayment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(AthletePayment::class);
    }

    /**
     * Which line of the academy's price list this athlete is on (#1381).
     * Null — the case for every athlete until someone is moved — means the
     * academy's own `monthly_fee_cents`.
     *
     * @return BelongsTo<AcademyFeeTier, $this>
     */
    public function feeTier(): BelongsTo
    {
        return $this->belongsTo(AcademyFeeTier::class, 'fee_tier_id');
    }

    /** @return HasMany<Carnet, $this> */
    public function carnets(): HasMany
    {
        return $this->hasMany(Carnet::class);
    }

    /**
     * Owner-facing log of every belt + stripe promotion this athlete
     * has received. Written by the AthleteObserver in lock-step with
     * the CommunityPost belt_promotion / stripe_promotion creation
     * (post-v2.9.0 feature: "voglio ricordarmi quando ho dato la
     * striscia a chi"). Descending-date order is the natural read
     * shape — newest first.
     *
     * @return HasMany<AthletePromotion, $this>
     */
    public function promotions(): HasMany
    {
        // Stable order — `recorded_at DESC, id DESC` tiebreaks two
        // events written in the same second (belt + stripe in a single
        // save), so the API and the UI render the same row first on
        // every call (Copilot review on #654).
        return $this->hasMany(AthletePromotion::class)
            ->orderByDesc('recorded_at')
            ->orderByDesc('id');
    }

    /**
     * Polymorphic address (#72b). Same shape and same enforcement as Academy:
     * `morphOne` is read-side, the 1:1 invariant is carried by the UNIQUE
     * index on `(addressable_type, addressable_id)` plus
     * `SyncAddressAction`'s atomic `updateOrCreate`. Always mutate through
     * the action — never `new Address()->save()` directly.
     *
     * @return MorphOne<Address, $this>
     */
    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    /**
     * Public URL of the athlete's photo — null when none is set (#1357).
     *
     * Same shape as `User::avatar_url` and `AcademyResource::logo_url`: the
     * wire always carries a URL, never the raw on-disk path.
     *
     * **The cache-buster is not decoration.** A replacement in the same format
     * writes to the same key, so the URL string would be byte-identical and the
     * browser would keep serving the old bitmap from cache — the owner would
     * upload a new photo and see the previous one. `?v={updated_at}` changes the
     * moment the row is touched, and any `forceFill()->save()` bumps that.
     */
    public function getPhotoUrlAttribute(): ?string
    {
        if ($this->photo_path === null) {
            return null;
        }

        $url = Storage::disk('public')->url($this->photo_path);

        // `photo_path` is only ever set through `forceFill()->save()`, so
        // `updated_at` is populated by the time we are here.
        return $url . '?v=' . ($this->updated_at?->getTimestamp() ?? 0);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'belt' => Belt::class,
            'status' => AthleteStatus::class,
            'date_of_birth' => 'date',
            'joined_at' => 'date',
            'stripes' => 'integer',
            'is_self' => 'boolean',
        ];
    }
}
