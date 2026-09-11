<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AttendanceSource;
use App\Observers\AttendanceObserver;
use Database\Factories\AttendanceRecordFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int                 $id
 * @property int                 $athlete_id
 * @property int|null            $lesson_id    Which lesson this presence belongs to (#1562); null when it was recorded without one — before the timetable, on a day with no class, or by the athlete's self-mark
 * @property \Carbon\Carbon      $attended_on
 * @property string|null         $notes
 * @property AttendanceSource    $source
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 */
#[Fillable([
    'athlete_id',
    'lesson_id',
    'attended_on',
    'notes',
    'source',
])]
#[ObservedBy([AttendanceObserver::class])]
class AttendanceRecord extends Model
{
    /** @use HasFactory<AttendanceRecordFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /**
     * The lesson this presence was recorded into (#1562). Null when the
     * presence was recorded without one: every row that predates the
     * timetable, any day the academy has no class, and the athlete's own
     * self-mark (`POST /me/attendance/today`), which knows no class. A
     * presence on a day, which is all a row here ever was before — and
     * which reads as present in every class of that day.
     *
     * @return BelongsTo<Lesson, $this>
     */
    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        // `date:Y-m-d` (vs plain `date`) makes the mutator serialize the value
        // as `YYYY-MM-DD` on write. Important for parity between the test DB
        // (SQLite TEXT, stores whatever string you give it) and production
        // (MySQL DATE, truncates the time portion natively). Queries use
        // `whereDate` as defense-in-depth — see MarkAttendanceAction.
        return [
            'attended_on' => 'date:Y-m-d',
            'source' => AttendanceSource::class,
        ];
    }
}
