<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Athlete;
use App\Models\Carnet;
use App\Support\CarnetCode;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Carnet>
 */
class CarnetFactory extends Factory
{
    /**
     * Mirrors `SellCarnetAction::VALIDITY_MONTHS`. Factories that invent their
     * own validity produce rows the application could never have written.
     */
    private const VALIDITY_MONTHS = 12;

    protected $model = Carnet::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => app(CarnetCode::class)->generate(),
            'athlete_id' => Athlete::factory(),
            'total_entries' => 10,
            'price_cents' => 7000,
            'purchased_at' => CarbonImmutable::today()->toDateString(),
            'valid_from' => CarbonImmutable::today()->toDateString(),
            'expires_at' => self::expiryFor(CarbonImmutable::today()),
        ];
    }

    /**
     * State: sold on a specific date, with validity starting the same day.
     * The common case — the owner clicks sell and the carnet starts covering
     * from that moment.
     */
    public function purchasedOn(string $date): static
    {
        $purchasedAt = CarbonImmutable::parse($date);

        return $this->state([
            'purchased_at' => $purchasedAt->toDateString(),
            'valid_from' => $purchasedAt->toDateString(),
            'expires_at' => self::expiryFor($purchasedAt),
        ]);
    }

    /**
     * State: validity starting on a specific date, independent of the sale
     * (#1380). This is the shape that makes a carnet cover sessions already on
     * the register — the expiry follows the validity start, not the purchase.
     */
    public function validFrom(string $date): static
    {
        $validFrom = CarbonImmutable::parse($date);

        return $this->state([
            'valid_from' => $validFrom->toDateString(),
            'expires_at' => self::expiryFor($validFrom),
        ]);
    }

    private static function expiryFor(CarbonImmutable $purchasedAt): string
    {
        return $purchasedAt->addMonthsNoOverflow(self::VALIDITY_MONTHS)->toDateString();
    }
}
