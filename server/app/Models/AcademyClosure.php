<?php

declare(strict_types=1);

namespace App\Models;

use App\Observers\ForgetsAttendanceSummaries;
use Database\Factories\AcademyClosureFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Days the academy is shut (#1766): "Chiusura estiva, 10–25 August".
 *
 * A closure is **whole days**. Cancelling one class of an evening is a
 * different thing, and giving this a class column would stop the attendance
 * denominator being about days. The dates stay `Y-m-d` strings, uncast, so
 * they compare as dates in SQLite's TEXT (see `AcademySchedule`).
 *
 * @property int         $id
 * @property int         $academy_id
 * @property string      $starts_on  `Y-m-d`
 * @property string      $ends_on    `Y-m-d`, inclusive; equal to `starts_on` for one day
 * @property string|null $label
 */
#[Fillable(['academy_id', 'starts_on', 'ends_on', 'label'])]
#[ObservedBy([ForgetsAttendanceSummaries::class])]
class AcademyClosure extends Model
{
    /** @use HasFactory<AcademyClosureFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<Academy, $this>
     */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }
}
