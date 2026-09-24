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
 * @property Carbon   $valid_from
 * @property Carbon   $expires_at
 * @property Carbon   $created_at
 * @property Carbon   $updated_at
 * @property-read int|null $entries_count Present only when the query used `withCount('entries')`
 */
#[Fillable(['code', 'athlete_id', 'total_entries', 'price_cents', 'purchased_at', 'valid_from', 'expires_at'])]
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
     * Carnets that could pay for a session on `$date`: inside the validity
     * window, earliest expiry first so the first row is the FIFO pick, with
     * the ledger count loaded.
     *
     * The count comes along deliberately. Whether a carnet still has entries
     * left is `CarnetAvailability::isActiveOn`, which every caller asks next
     * and which throws without `entries_count` — so loading it here makes the
     * half-configured query (window but no count, or count but no ordering)
     * impossible to write by accident. The balance test itself stays in the
     * helper here; a caller that must filter by it in SQL uses
     * `scopeSpendableOn` below, which is held to the helper by a test.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeValidOn(Builder $query, CarbonInterface $date): Builder
    {
        return $query
            ->whereDate('valid_from', '<=', $date->toDateString())
            ->whereDate('expires_at', '>=', $date->toDateString())
            ->withCount('entries')
            ->orderBy('expires_at')
            ->orderBy('id');
    }

    /**
     * Carnets spendable on `$date`, decided in SQL (#1722).
     *
     * `CarnetAvailability::isActiveOn` is the rule; this is the same rule for
     * a caller that has to filter a query — "who owes this month" — instead of
     * inspecting rows it already holds. One rule, two dialects, the precedent
     * being `AthletePayment::scopeCovering`: `OwingThisMonthTest` holds them
     * to the same answer over both window edges and the balance, so a change
     * to one that forgets the other fails there rather than on the roster.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeSpendableOn(Builder $query, CarbonInterface $date): Builder
    {
        return $query
            ->whereDate('valid_from', '<=', $date->toDateString())
            ->whereDate('expires_at', '>=', $date->toDateString())
            ->whereRaw('total_entries > (select count(*) from carnet_entries where carnet_entries.carnet_id = carnets.id)');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'purchased_at' => 'date:Y-m-d',
            'valid_from' => 'date:Y-m-d',
            'expires_at' => 'date:Y-m-d',
            'total_entries' => 'integer',
            'price_cents' => 'integer',
        ];
    }
}
