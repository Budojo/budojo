<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AthletePromotion>
 */
class AthletePromotionFactory extends Factory
{
    protected $model = AthletePromotion::class;

    /**
     * Default state builds a stripe promotion (the more common
     * milestone). Tests override `kind`, `from_*`, `to_*` per case.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'athlete_id' => Athlete::factory(),
            'kind' => 'stripe',
            'from_belt' => null,
            'to_belt' => null,
            'from_stripes' => 0,
            'to_stripes' => 1,
            'recorded_at' => now(),
            'recorded_by_user_id' => User::factory(),
        ];
    }
}
