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
     * Polymorphic address (#72) — `morphOne` enforces the 1:1 invariant at
     * the relation layer (deletes any prior row when a new one is associated)
     * so callers don't have to think about orphaned addresses on every save.
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
