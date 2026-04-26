<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Athlete;
use App\Models\AthletePayment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AthletePayment>
 */
class AthletePaymentFactory extends Factory
{
    protected $model = AthletePayment::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'athlete_id' => Athlete::factory(),
            'year' => (int) now()->year,
            'month' => $this->faker->numberBetween(1, 12),
            'amount_cents' => 9500,
            'paid_at' => now(),
        ];
    }

    /** State: payment for the current month. */
    public function forCurrentMonth(): static
    {
        return $this->state([
            'year' => (int) now()->year,
            'month' => (int) now()->month,
        ]);
    }

    /** State: payment for a specific (year, month). */
    public function forYearMonth(int $year, int $month): static
    {
        return $this->state(['year' => $year, 'month' => $month]);
    }
}
