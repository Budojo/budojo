<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Academy>
 */
class AcademyFactory extends Factory
{
    protected $model = Academy::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = $this->faker->company();

        return [
            'user_id' => User::factory(),
            'name'    => $name,
            'slug'    => Str::slug($name).'-'.Str::lower(Str::random(8)),
            'address' => $this->faker->optional()->address(),
        ];
    }
}
