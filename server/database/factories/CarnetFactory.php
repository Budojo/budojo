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
            'expires_at' => self::expiryFor(CarbonImmutable::today()),
        ];
    }

    /** State: a carnet purchased on a specific date, expiring 12 months later. */
    public function purchasedOn(string $date): static
    {
        $purchasedAt = CarbonImmutable::parse($date);

        return $this->state([
            'purchased_at' => $purchasedAt->toDateString(),
            'expires_at' => self::expiryFor($purchasedAt),
        ]);
    }

    private static function expiryFor(CarbonImmutable $purchasedAt): string
    {
        return $purchasedAt->addMonthsNoOverflow(self::VALIDITY_MONTHS)->toDateString();
    }
}
