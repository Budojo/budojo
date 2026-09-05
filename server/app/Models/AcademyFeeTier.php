<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Database\Factories\AcademyFeeTierFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One line of an academy's price list (#1381).
 *
 * An academy used to have exactly one monthly fee. Academies that charge by
 * how often someone trains — 2 lessons €55, 3 lessons €65 — had no way to say
 * so, and were reduced to selling carnets as a stand-in just to tell the two
 * groups apart.
 *
 * `academies.monthly_fee_cents` survives as the **default** for athletes on no
 * tier, which is every athlete until someone is moved onto one. Nothing about
 * an existing academy changes by this table existing.
 *
 * @property int    $id
 * @property int    $academy_id
 * @property string $label
 * @property int    $amount_cents
 * @property int    $lessons_per_week
 * @property-read int|null $athletes_count Present only when the query used `withCount('athletes')`
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['academy_id', 'label', 'amount_cents', 'lessons_per_week'])]
class AcademyFeeTier extends Model
{
    /** @use HasFactory<AcademyFeeTierFactory> */
    use HasFactory;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return HasMany<Athlete, $this> */
    public function athletes(): HasMany
    {
        return $this->hasMany(Athlete::class, 'fee_tier_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount_cents' => 'integer',
            'lessons_per_week' => 'integer',
        ];
    }
}
