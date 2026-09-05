<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\BillingPeriod;
use App\Observers\Audit\AthletePaymentAuditObserver;
use Carbon\Carbon;
use Database\Factories\AthletePaymentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One recorded membership payment, covering a period that starts at
 * (`year`, `month`) and runs for `period_months` (#1382).
 *
 * Until billing periods existed a row *was* a month, and the absence of a row
 * was the state "unpaid" — so every read was a lookup by key. It is now an
 * interval, and every "is this month covered?" question goes through
 * `scopeCovering()`. That scope is the single expression of the rule; a
 * caller writing the arithmetic itself is how two surfaces come to disagree.
 *
 * `UNIQUE(athlete_id, year, month)` still stops two payments *starting* in
 * the same month, and `RecordAthletePaymentAction` finds-or-returns rather
 * than colliding. It no longer stops overlap, though — a March monthly and a
 * February quarterly start in different months and cover the same March — so
 * that rejection lives in the Action, not in the schema.
 *
 * @property int           $id
 * @property int           $athlete_id
 * @property int           $year   First year of the covered period
 * @property int           $month  First month of the covered period, 1-12
 * @property BillingPeriod $period_months
 * @property int           $amount_cents
 * @property Carbon        $paid_at
 * @property Carbon        $created_at
 * @property Carbon        $updated_at
 */
#[Fillable(['athlete_id', 'year', 'month', 'period_months', 'amount_cents', 'paid_at'])]
#[ObservedBy([AthletePaymentAuditObserver::class])]
class AthletePayment extends Model
{
    /** @use HasFactory<AthletePaymentFactory> */
    use HasFactory;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /**
     * Absolute month index, counting from year 0 — the arithmetic that makes
     * "does this period contain that month" a comparison of two integers
     * instead of a pair of nested year/month conditions.
     */
    public static function monthIndex(int $year, int $month): int
    {
        return $year * 12 + ($month - 1);
    }

    /**
     * Payments whose period contains (`$year`, `$month`).
     *
     * The one place the containment rule is written. Every surface that used
     * to ask `where year = ? and month = ?` asks this instead: the twelve-month
     * table, `paid_current_month`, the `?paid` filter, the unpaid widget, the
     * owner's digest, the overdue push, and the months the monthly fee covers
     * during carnet reconciliation.
     *
     * Deliberately not indexable. The expression spans two columns plus a
     * duration, and no index would serve it; at one academy's worth of rows
     * that is a non-question, and the alternative — a denormalised month index
     * column kept in step by hand — buys speed nobody needs with a second
     * source of truth.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeCovering(Builder $query, int $year, int $month): Builder
    {
        $target = self::monthIndex($year, $month);

        return $query
            ->whereRaw('(year * 12 + month - 1) <= ?', [$target])
            ->whereRaw('(year * 12 + month - 1 + period_months) > ?', [$target]);
    }

    /**
     * Payments whose period shares at least one month with the period
     * starting at (`$year`, `$month`) and running `$periodMonths`.
     *
     * Two half-open intervals overlap when each starts before the other ends
     * — the standard test, and the reason a March monthly and a February
     * quarterly are caught even though neither starts where the other does.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeOverlapping(Builder $query, int $year, int $month, int $periodMonths): Builder
    {
        $start = self::monthIndex($year, $month);
        $end = $start + $periodMonths;

        return $query
            ->whereRaw('(year * 12 + month - 1) < ?', [$end])
            ->whereRaw('(year * 12 + month - 1 + period_months) > ?', [$start]);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'year' => 'integer',
            'month' => 'integer',
            'period_months' => BillingPeriod::class,
            'amount_cents' => 'integer',
        ];
    }
}
