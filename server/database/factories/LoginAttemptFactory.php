<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\LoginAttempt;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LoginAttempt>
 */
class LoginAttemptFactory extends Factory
{
    protected $model = LoginAttempt::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'email_attempted' => $this->faker->unique()->safeEmail(),
            'ip_address' => $this->faker->ipv4(),
            'user_agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'success' => true,
        ];
    }

    public function failed(): self
    {
        return $this->state(fn () => ['success' => false]);
    }

    public function withoutUser(): self
    {
        return $this->state(fn () => ['user_id' => null]);
    }
}
