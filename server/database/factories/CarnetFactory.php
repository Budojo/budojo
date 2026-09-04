<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Athlete;
use App\Models\Carnet;
use App\Support\CarnetCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Carnet>
 */
class CarnetFactory extends Factory
{
    protected $model = Carnet::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $purchasedAt = now()->startOfDay();

        return [
            'code' => app(CarnetCode::class)->generate(),
            'athlete_id' => Athlete::factory(),
            'total_entries' => 10,
            'price_cents' => 7000,
            'purchased_at' => $purchasedAt->toDateString(),
            'expires_at' => $purchasedAt->copy()->addMonths(12)->toDateString(),
        ];
    }

    /** State: a carnet that expired yesterday. */
    public function expired(): static
    {
        return $this->state([
            'purchased_at' => now()->subMonths(13)->toDateString(),
            'expires_at' => now()->subDay()->toDateString(),
        ]);
    }

    /** State: a carnet purchased on a specific date, expiring 12 months later. */
    public function purchasedOn(string $date): static
    {
        return $this->state([
            'purchased_at' => $date,
            'expires_at' => \Carbon\CarbonImmutable::parse($date)->addMonths(12)->toDateString(),
        ]);
    }
}
