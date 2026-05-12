<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PostComment>
 */
class PostCommentFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'post_id' => CommunityPost::factory(),
            'user_id' => User::factory(),
            // Default short body — well under the 500-char FormRequest cap.
            'body' => fake()->sentence(8),
        ];
    }
}
