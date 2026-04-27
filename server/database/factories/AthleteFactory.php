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
        // 50% of athletes have a phone on file. We hand-pick an Italian
        // mobile-prefix combination that libphonenumber considers reachable
        // — `+39` + `333xxxxxxx` — so factory rows pass the same validation
        // as user-submitted data and downstream tests don't need to special-
        // case the phone shape.
        $hasPhone = $this->faker->boolean(50);

        return [
            'academy_id'            => Academy::factory(),
            'first_name'            => $this->faker->firstName(),
            'last_name'             => $this->faker->lastName(),
            'email'                 => $this->faker->boolean(70) ? $this->faker->unique()->safeEmail() : null,
            'phone_country_code'    => $hasPhone ? '+39' : null,
            'phone_national_number' => $hasPhone ? '333' . $this->faker->numerify('#######') : null,
            'date_of_birth'         => $this->faker->optional(0.6)->dateTimeBetween('-50 years', '-16 years')?->format('Y-m-d'),
            'belt'                  => $this->faker->randomElement(Belt::cases())->value,
            'stripes'               => $this->faker->numberBetween(0, 4),
            'status'                => AthleteStatus::Active->value,
            'joined_at'             => $this->faker->dateTimeBetween('-5 years', 'now')->format('Y-m-d'),
        ];
    }
}
