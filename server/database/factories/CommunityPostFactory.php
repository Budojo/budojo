<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Academy;
use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CommunityPost>
 */
class CommunityPostFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id' => Academy::factory(),
            'type' => CommunityPostType::OwnerAnnouncement,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => ['body' => fake()->sentence()],
            'created_by_user_id' => User::factory(),
        ];
    }

    public function beltPromotion(int $athleteId, string $oldBelt, string $newBelt): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => CommunityPostType::BeltPromotion,
            'payload' => [
                'athlete_id' => $athleteId,
                'old_belt' => $oldBelt,
                'new_belt' => $newBelt,
                'promoted_at' => now()->toISOString(),
            ],
        ]);
    }

    public function event(string $title = 'Open mat', string $startsAt = '+1 week'): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => CommunityPostType::Event,
            'payload' => [
                'title' => $title,
                'description' => fake()->paragraph(),
                'starts_at' => now()->modify($startsAt)->toISOString(),
                'location_text' => fake()->streetAddress() . ', ' . fake()->city(),
                'location_address' => null,
                'location_lat' => null,
                'location_lon' => null,
                'max_attendees' => null,
            ],
        ]);
    }

    public function sharedVideo(string $provider = 'youtube', ?string $caption = null): static
    {
        return $this->state(fn (array $attributes) => [
            'type' => CommunityPostType::SharedVideo,
            'payload' => array_filter([
                'provider' => $provider,
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'video_id' => 'dQw4w9WgXcQ',
                'thumbnail_path' => 'community/video-thumbnails/sample.jpg',
                'title' => 'Technique of the week',
                'author_name' => 'BJJ Channel',
                'caption' => $caption,
            ], static fn (mixed $v): bool => $v !== null),
        ]);
    }
}
