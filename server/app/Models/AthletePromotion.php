<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Belt;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per belt or stripe promotion event on an athlete. Written
 * by the AthleteObserver when `Athlete::$belt` or `Athlete::$stripes`
 * changes; never mutated after creation — it's an append-only audit
 * log.
 *
 * `kind` discriminates which columns are meaningful:
 *
 * - `belt`: `from_belt` (nullable, NULL on first assignment) + `to_belt`
 *   populated; stripe columns null.
 * - `stripe`: `from_stripes` + `to_stripes` populated; belt columns
 *   null.
 *
 * `recorded_by_user_id` is the editor (owner). The observer skips
 * console / seeder context entirely (Auth::id() is null there), so
 * this column is non-nullable.
 *
 * @property int                           $id
 * @property int                           $athlete_id
 * @property 'belt'|'stripe'               $kind
 * @property Belt|null                     $from_belt
 * @property Belt|null                     $to_belt
 * @property int|null                      $from_stripes
 * @property int|null                      $to_stripes
 * @property \Illuminate\Support\Carbon    $recorded_at
 * @property int                           $recorded_by_user_id
 * @property \Illuminate\Support\Carbon    $created_at
 * @property \Illuminate\Support\Carbon    $updated_at
 * @property-read Athlete                  $athlete
 * @property-read User                     $recordedBy
 */
#[Fillable([
    'athlete_id',
    'kind',
    'from_belt',
    'to_belt',
    'from_stripes',
    'to_stripes',
    'recorded_at',
    'recorded_by_user_id',
])]
class AthletePromotion extends Model
{
    /** @use HasFactory<\Database\Factories\AthletePromotionFactory> */
    use HasFactory;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /** @return BelongsTo<User, $this> */
    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'from_belt' => Belt::class,
            'to_belt' => Belt::class,
            'from_stripes' => 'integer',
            'to_stripes' => 'integer',
            'recorded_at' => 'datetime',
        ];
    }
}
