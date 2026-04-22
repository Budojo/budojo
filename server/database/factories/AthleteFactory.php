<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Belt;
use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Athlete>
 */
class AthleteFactory extends Factory
{
    protected $model = Athlete::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id'    => Academy::factory(),
            'first_name'    => $this->faker->firstName(),
            'last_name'     => $this->faker->lastName(),
            'email'         => $this->faker->optional(0.7)->safeEmail(),
            'phone'         => $this->faker->optional(0.5)->phoneNumber(),
            'date_of_birth' => $this->faker->optional(0.6)->dateTimeBetween('-50 years', '-16 years')?->format('Y-m-d'),
            'belt'          => $this->faker->randomElement(Belt::cases())->value,
            'stripes'       => $this->faker->numberBetween(0, 4),
            'status'        => AthleteStatus::Active->value,
            'joined_at'     => $this->faker->dateTimeBetween('-5 years', 'now')->format('Y-m-d'),
        ];
    }
}
