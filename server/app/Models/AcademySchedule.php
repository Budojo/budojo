<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One row per "schedule starting on this date" entry (#1094).
 *
 * Schedule changes are insert-not-update: the owner sets a new
 * `training_days` effective from date X, and a new row lands here with
 * `effective_from = X`. The "current schedule" for any date D is the
 * row with the largest `effective_from <= D` for that academy. The
 * sibling `Academy::scheduleForDate()` is the canonical lookup;
 * application code never queries this table directly.
 *
 * The `academies.training_days` column stays alive as a denormalised
 * "current cache" — see PRD `docs/specs/training-schedule-history.md`.
 *
 * @property int                $id
 * @property int                $academy_id
 * @property list<int>|null     $training_days  Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured" for this period (parity with the legacy column).
 * @property Carbon             $effective_from
 * @property Carbon             $created_at
 * @property Carbon             $updated_at
 */
#[Fillable(['academy_id', 'training_days', 'effective_from'])]
class AcademySchedule extends Model
{
    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /**
     * `effective_from` is a calendar-day value, not a timestamp. The
     * default `'date'` cast stores values via Eloquent's `fromDateTime`
     * which uses the model's `Y-m-d H:i:s` format — under SQLite that
     * ships as `'2026-05-15 00:00:00'` TEXT, and lex comparison breaks
     * the natural `effective_from <= ?` lookup ("2026-05-15" sorts BEFORE
     * "2026-05-15 00:00:00" because the shorter prefix is smaller). A
     * dedicated accessor/mutator normalises both sides to `Y-m-d` so
     * the SQLite TEXT path and the MySQL DATE path stay equivalent.
     *
     * @return Attribute<Carbon, string>
     */
    protected function effectiveFrom(): Attribute
    {
        return Attribute::make(
            get: function (mixed $value): ?Carbon {
                if ($value === null) {
                    return null;
                }

                return \is_string($value) ? Carbon::parse($value) : null;
            },
            set: function (mixed $value): string {
                if ($value instanceof Carbon) {
                    return $value->toDateString();
                }
                if (\is_string($value)) {
                    return Carbon::parse($value)->toDateString();
                }

                throw new \InvalidArgumentException(
                    'effective_from must be a Carbon instance or a Y-m-d string.',
                );
            },
        );
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'training_days' => 'array',
        ];
    }
}
