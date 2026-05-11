<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\RsvpResponse;
use App\Models\CommunityPost;
use App\Models\PostRsvp;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PostRsvp>
 */
class PostRsvpFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Default to an event-type parent so the PR-E Action's
            // "post must be event" check passes when tests build RSVPs
            // via the factory.
            'post_id' => CommunityPost::factory()->event(),
            'user_id' => User::factory(),
            'response' => RsvpResponse::Going,
        ];
    }

    public function maybe(): static
    {
        return $this->state(fn (array $attributes) => [
            'response' => RsvpResponse::Maybe,
        ]);
    }
}
