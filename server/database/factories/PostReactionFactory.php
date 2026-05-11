<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ReactionEmoji;
use App\Models\CommunityPost;
use App\Models\PostReaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PostReaction>
 */
class PostReactionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'post_id' => CommunityPost::factory(),
            'user_id' => User::factory(),
            'emoji' => ReactionEmoji::Clap,
        ];
    }

    public function pray(): static
    {
        return $this->state(fn (array $attributes) => [
            'emoji' => ReactionEmoji::Pray,
        ]);
    }
}
