<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\CommunityPost;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Create an event-type community post on behalf of an academy owner.
 *
 * Payload shape matches the factory-built events the feed already
 * renders: `title`, `description` (optional), `starts_at` (ISO 8601
 * UTC string), `location_text` (free-form, optional), `location_lat`
 * / `location_lon` (V2 map view — accept nullable here so the V2
 * migration doesn't need to rewrite existing rows), `max_attendees`
 * (optional, null = uncapped).
 *
 * Authorization (caller is an owner + posting under their owned
 * academy) lives in the FormRequest.
 *
 * Eager-loads the relations `CommunityPostResource` projects so the
 * controller can echo the wire shape on the 201 without a follow-up
 * round-trip.
 *
 * @phpstan-type EventPayload array{
 *   title: string,
 *   description?: string|null,
 *   starts_at: string,
 *   location_text?: string|null,
 *   location_lat?: float|null,
 *   location_lon?: float|null,
 *   max_attendees?: int|null,
 * }
 */
class CreateEventAction
{
    /**
     * @param  EventPayload  $payload
     */
    public function execute(User $author, int $academyId, array $payload): CommunityPost
    {
        $startsAt = CarbonImmutable::parse($payload['starts_at'])->toIso8601String();

        /** @var CommunityPost $post */
        $post = CommunityPost::create([
            'academy_id' => $academyId,
            'type' => CommunityPostType::Event,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => [
                'title' => $payload['title'],
                'description' => $payload['description'] ?? null,
                'starts_at' => $startsAt,
                'location_text' => $payload['location_text'] ?? null,
                'location_lat' => $payload['location_lat'] ?? null,
                'location_lon' => $payload['location_lon'] ?? null,
                'max_attendees' => $payload['max_attendees'] ?? null,
            ],
            'created_by_user_id' => $author->id,
        ]);

        $post->load([
            'createdBy:id,first_name,last_name,handle,avatar_path,updated_at',
            'createdBy.athlete:id,user_id,belt',
        ]);

        return $post;
    }
}
