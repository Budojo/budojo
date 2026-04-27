<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Database\Factories\AthletePaymentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Recorded membership payment for an athlete in a specific (year, month).
 * One row per (athlete_id, year, month) — enforced by the unique index;
 * idempotency is handled by `RecordAthletePaymentAction` which finds-or-returns
 * the existing row instead of attempting a duplicate insert.
 *
 * @property int       $id
 * @property int       $athlete_id
 * @property int       $year
 * @property int       $month
 * @property int       $amount_cents
 * @property Carbon    $paid_at
 * @property Carbon    $created_at
 * @property Carbon    $updated_at
 */
#[Fillable(['athlete_id', 'year', 'month', 'amount_cents', 'paid_at'])]
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
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'paid_at' => 'datetime',
            'year' => 'integer',
            'month' => 'integer',
            'amount_cents' => 'integer',
        ];
    }
}
