<?php

declare(strict_types=1);

namespace App\Models;

use App\Observers\Audit\CarnetAuditObserver;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Database\Factories\CarnetFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A pre-paid pack of entries sold to an athlete. `total_entries` and
 * `price_cents` are snapshotted from the academy config at purchase;
 * the residual balance is never stored — it is derived by counting the
 * `carnet_entries` ledger, so it cannot drift out of sync.
 *
 * @property int      $id
 * @property string   $code
 * @property int      $athlete_id
 * @property int      $total_entries
 * @property int      $price_cents
 * @property Carbon   $purchased_at
 * @property Carbon   $expires_at
 * @property Carbon   $created_at
 * @property Carbon   $updated_at
 * @property-read int|null $entries_count Present only when the query used `withCount('entries')`
 */
#[Fillable(['code', 'athlete_id', 'total_entries', 'price_cents', 'purchased_at', 'expires_at'])]
#[ObservedBy([CarnetAuditObserver::class])]
class Carnet extends Model
{
    /** @use HasFactory<CarnetFactory> */
    use HasFactory;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /** @return HasMany<CarnetEntry, $this> */
    public function entries(): HasMany
    {
        return $this->hasMany(CarnetEntry::class);
    }

    /**
     * Inside the validity window on `$date`, earliest expiry first so the
     * first row is the one to spend — the athlete loses the fewest entries.
     *
     * The window only; whether a carnet still has entries left is
     * `CarnetAvailability::isActiveOn`, which is the whole rule. Expressing
     * the balance here as well would be the same rule written twice, in two
     * languages.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeValidOn(Builder $query, CarbonInterface $date): Builder
    {
        return $query
            ->whereDate('purchased_at', '<=', $date->toDateString())
            ->whereDate('expires_at', '>=', $date->toDateString())
            ->orderBy('expires_at')
            ->orderBy('id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'purchased_at' => 'date:Y-m-d',
            'expires_at' => 'date:Y-m-d',
            'total_entries' => 'integer',
            'price_cents' => 'integer',
        ];
    }
}
