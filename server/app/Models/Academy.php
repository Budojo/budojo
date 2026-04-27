<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\AcademyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;

/**
 * @property int                 $id
 * @property int                 $user_id
 * @property string              $name
 * @property string              $slug
 * @property string|null         $logo_path
 * @property int|null            $monthly_fee_cents
 * @property list<int>|null      $training_days  Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured"
 */
#[Fillable(['user_id', 'name', 'slug', 'logo_path', 'monthly_fee_cents', 'training_days'])]
class Academy extends Model
{
    /** @use HasFactory<AcademyFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<Athlete, $this> */
    public function athletes(): HasMany
    {
        return $this->hasMany(Athlete::class);
    }

    /**
     * Polymorphic address (#72). `morphOne` is a READ-side convenience —
     * Eloquent returns the first matching row but does not enforce that
     * only one exists. The 1:1 invariant is enforced by:
     *
     *   1. A UNIQUE index on `(addressable_type, addressable_id)` in the
     *      `addresses` table (see `create_addresses_table` migration).
     *   2. `SyncAcademyAddressAction` going through this relation's
     *      `updateOrCreate(...)` so concurrent inserts hit the constraint
     *      instead of silently producing duplicate rows.
     *
     * Always mutate the address through `SyncAcademyAddressAction`, never
     * by `new Address()->save()` against this relation directly.
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
            'training_days' => 'array',
        ];
    }
}
