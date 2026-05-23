<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AchievementKind;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Athlete-side milestone unlock (#961). One row per (athlete, kind)
 * — UNIQUE at the schema level, idempotent at the action layer.
 *
 * @property int                       $id
 * @property int                       $athlete_id
 * @property AchievementKind           $kind
 * @property \Carbon\Carbon            $unlocked_at
 * @property array<string, mixed>|null $metadata
 * @property \Carbon\Carbon|null       $created_at
 * @property \Carbon\Carbon|null       $updated_at
 */
#[Fillable(['athlete_id', 'kind', 'unlocked_at', 'metadata'])]
class Achievement extends Model
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
            'unlocked_at' => 'datetime',
            'metadata' => 'array',
            'kind' => AchievementKind::class,
        ];
    }
}
