<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Belt;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A step the owner said this athlete never took (#1966): the grade `belt` +
 * `stripes` was never reached by that step, so the promotion timeline stops
 * offering it as missing. Deleting the row is the undo.
 *
 * @property int                        $id
 * @property int                        $athlete_id
 * @property Belt                       $belt
 * @property int                        $stripes
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read Athlete               $athlete
 */
#[Fillable(['athlete_id', 'belt', 'stripes'])]
class AthletePromotionSkip extends Model
{
    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'belt' => Belt::class,
            'stripes' => 'integer',
        ];
    }
}
