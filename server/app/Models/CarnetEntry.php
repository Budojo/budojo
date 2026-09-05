<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Database\Factories\CarnetEntryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One consumed entry from a carnet, pinned to the attendance record that
 * consumed it. The unique index on `attendance_record_id` is what makes
 * double-consumption structurally impossible.
 *
 * @property int    $id
 * @property int    $carnet_id
 * @property int    $attendance_record_id
 * @property Carbon $used_on
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['carnet_id', 'attendance_record_id', 'used_on'])]
class CarnetEntry extends Model
{
    /** @use HasFactory<CarnetEntryFactory> */
    use HasFactory;

    /** @return BelongsTo<Carnet, $this> */
    public function carnet(): BelongsTo
    {
        return $this->belongsTo(Carnet::class);
    }

    /** @return BelongsTo<AttendanceRecord, $this> */
    public function attendanceRecord(): BelongsTo
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'used_on' => 'date:Y-m-d',
        ];
    }
}
