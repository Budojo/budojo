<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PendingEmailChange>
 */
class PendingEmailChangeFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'new_email' => fake()->unique()->safeEmail(),
            // Stored hashed — see `PendingEmailChange::hashToken()` for
            // the rationale. Tests that need the *raw* token generate
            // it themselves and pass `token => PendingEmailChange::hashToken($raw)`.
            'token' => PendingEmailChange::hashToken(Str::random(64)),
            'expires_at' => now()->addDay(),
            'requested_at' => now(),
        ];
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'expires_at' => now()->subHour(),
        ]);
    }
}
