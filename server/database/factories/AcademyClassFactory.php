<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ClassKind;
use App\Models\Academy;
use App\Models\AcademyClass;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademyClass>
 */
class AcademyClassFactory extends Factory
{
    protected $model = AcademyClass::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id' => Academy::factory(),
            'name' => $this->faker->randomElement(['Fundamentals', 'Advanced', 'Kids', 'Open mat']),
            // A weekday, not the weekend — most tests want "a normal training
            // night" and pick the day explicitly when the day is the point.
            'weekday' => $this->faker->numberBetween(1, 5),
            'starts_at' => '19:00',
            'duration_minutes' => 60,
            'kind' => ClassKind::Gi,
        ];
    }

    /** A class that has no clock time — the academy that does not run by one. */
    public function untimed(): static
    {
        return $this->state(['starts_at' => null, 'duration_minutes' => null]);
    }
}
