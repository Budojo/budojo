<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Academy;
use App\Models\AcademyFeeTier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademyFeeTier>
 */
class AcademyFeeTierFactory extends Factory
{
    protected $model = AcademyFeeTier::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $lessons = $this->faker->numberBetween(1, 5);

        return [
            'academy_id' => Academy::factory(),
            // Unique per academy at the schema level, so the label carries the
            // lesson count to keep generated tiers from colliding.
            'label' => "{$lessons} lezioni",
            'amount_cents' => 5000 + ($lessons * 500),
            'lessons_per_week' => $lessons,
        ];
    }
}
