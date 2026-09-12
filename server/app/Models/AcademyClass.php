<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ClassKind;
use App\Observers\AcademyClassObserver;
use Carbon\Carbon;
use Database\Factories\AcademyClassFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One recurring slot on the academy's weekly timetable (#1562).
 *
 * "Fundamentals, Monday, 19:00, gi." Mutable, because timetables change; the
 * past is protected by each {@see Lesson} copying what it needs at creation,
 * so editing a class here never rewrites an evening that already happened.
 *
 * @property int         $id
 * @property int         $academy_id
 * @property string      $name
 * @property int         $weekday          Carbon dayOfWeek, 0=Sun..6=Sat
 * @property string|null $starts_at        `HH:MM`, or null for a class with no clock time
 * @property int|null    $duration_minutes
 * @property ClassKind   $kind
 * @property Carbon      $created_at
 * @property Carbon      $updated_at
 */
#[Fillable(['academy_id', 'name', 'weekday', 'starts_at', 'duration_minutes', 'kind'])]
#[ObservedBy([AcademyClassObserver::class])]
class AcademyClass extends Model
{
    /** @use HasFactory<AcademyClassFactory> */
    use HasFactory;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return HasMany<Lesson, $this> */
    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'weekday' => 'integer',
            'duration_minutes' => 'integer',
            'kind' => ClassKind::class,
        ];
    }
}
