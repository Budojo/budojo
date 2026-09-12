<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ClassKind;
use Carbon\Carbon;
use Database\Factories\LessonFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One real occurrence of a class on one date (#1562).
 *
 * The thing attendance points at, and the thing topics hang off (#1564).
 * Created by {@see \App\Actions\Lesson\MaterialiseLessonAction} — the first
 * time somebody is checked in, or when its topics are planned ahead.
 *
 * `name`, `starts_at` and `kind` are a snapshot of the class as it was when
 * this row was created — on the day, for a lesson born of a check-in; earlier,
 * for one planned ahead (#1564). Copied once and never re-read, so the
 * timetable can change without the past changing with it.
 *
 * @property int         $id
 * @property int         $academy_id
 * @property int|null    $academy_class_id  Null once the class was deleted; the snapshot keeps the name
 * @property Carbon      $held_on
 * @property string      $name
 * @property string|null $starts_at         `HH:MM` or null
 * @property int|null    $duration_minutes  Snapshot of the class's length when the lesson was created (#1591); null when the class never set one
 * @property ClassKind   $kind
 * @property string|null $notes
 * @property Carbon      $created_at
 * @property Carbon      $updated_at
 */
#[Fillable(['academy_id', 'academy_class_id', 'held_on', 'name', 'starts_at', 'duration_minutes', 'kind', 'notes'])]
class Lesson extends Model
{
    /** @use HasFactory<LessonFactory> */
    use HasFactory;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return BelongsTo<AcademyClass, $this> */
    public function academyClass(): BelongsTo
    {
        return $this->belongsTo(AcademyClass::class);
    }

    /** @return HasMany<AttendanceRecord, $this> */
    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    /**
     * What this lesson covered (#1564) — the plan before it is held, the
     * record after, and the same list either way.
     *
     * `withTrashed()` on purpose: a topic taken out of the programme must
     * still name itself on the lessons that taught it. The alternative —
     * links that silently empty out — would rewrite the past every time the
     * owner tidied the syllabus.
     *
     * @return BelongsToMany<SyllabusTopic, $this>
     */
    public function topics(): BelongsToMany
    {
        return $this->belongsToMany(SyllabusTopic::class, 'lesson_topic')
            ->withTrashed()
            ->orderBy('syllabus_topics.sort_order')
            ->orderBy('syllabus_topics.name');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            // Same `date:Y-m-d` as `attendance_records.attended_on`, and for
            // the same reason: the SQLite TEXT path and the MySQL DATE path
            // have to compare equal to the string the query hands them.
            'held_on' => 'date:Y-m-d',
            'duration_minutes' => 'integer',
            'kind' => ClassKind::class,
        ];
    }
}
