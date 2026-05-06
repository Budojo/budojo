<?php

declare(strict_types=1);

namespace App\Models;

use App\Contracts\HasAddress;
use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Observers\AthleteObserver;
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

/**
 * @property int                     $id
 * @property int                     $academy_id
 * @property int|null                $user_id                M7 athlete-login link (#445). Null until the athlete accepts the invite; non-null afterwards.
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
#[Fillable(['academy_id', 'user_id', 'first_name', 'last_name', 'email', 'phone_country_code', 'phone_national_number', 'website', 'facebook', 'instagram', 'date_of_birth', 'belt', 'stripes', 'status', 'joined_at'])]
#[ObservedBy([AthleteObserver::class])]
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
        ];
    }
}
