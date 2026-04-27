<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\AttendanceRecordFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int                 $id
 * @property int                 $athlete_id
 * @property \Carbon\Carbon      $attended_on
 * @property string|null         $notes
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 */
#[Fillable([
    'athlete_id',
    'attended_on',
    'notes',
])]
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
        ];
    }
}
