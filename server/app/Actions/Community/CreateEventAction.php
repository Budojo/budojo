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
 * renders: `title`, `description` (optional), `starts_at` (canonical
 * UTC ISO 8601 string, normalized regardless of the caller's input
 * offset), `location_text` (free-form, optional), `location_address`
 * (V2 structured address, always written null in V1 so the key is
 * stable — the schema test pins it), `location_lat` / `location_lon`
 * (V2 map view — accept nullable here so the V2 migration doesn't
 * need to rewrite existing rows), `max_attendees` (optional, null =
 * uncapped).
 *
 * Authorization (caller is an owner + posting under their owned
 * academy) lives in the FormRequest.
 *
 * Eager-loads the relations `CommunityPostResource` projects on a
 * single post so the controller can echo the wire shape on the 201
 * without a follow-up round-trip — and CRUCIALLY constrains the
 * `reactions` / `rsvps` relations to the author so they don't load
 * every row on the post (Copilot review on PR #632). The newly-
 * created post can't have either yet, so the eager-load is a cheap
 * "always-empty collection" placeholder that lets the Resource read
 * `$post->reactions->first()` without an extra lazy-load query.
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
        // Normalize to canonical UTC — `CarbonImmutable::parse` keeps
        // the caller's offset (e.g. `2026-06-13T10:00:00+02:00` stays
        // CEST); the API contract is "canonical UTC", matching the
        // factory's `toISOString()` shape (Copilot review on #632).
        $startsAt = CarbonImmutable::parse($payload['starts_at'])->utc()->toISOString();

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
                // V2 will populate this from a Maps autocomplete pick;
                // V1 writes null so the key is always present
                // (CommunitySchemaTest pins it). Copilot review on #632.
                'location_address' => null,
                'location_lat' => $payload['location_lat'] ?? null,
                'location_lon' => $payload['location_lon'] ?? null,
                'max_attendees' => $payload['max_attendees'] ?? null,
            ],
            'created_by_user_id' => $author->id,
        ]);

        $post->load([
            'createdBy:id,first_name,last_name,handle,avatar_path,updated_at',
            'createdBy.athlete:id,user_id,belt',
            // Constrain to the author so `$post->reactions->first()` /
            // `$post->rsvps->first()` in the Resource don't trip a
            // lazy-load that scans every row on the post. The new post
            // can't have either yet — the collection is always empty —
            // but the eager-load itself is what the Resource needs to
            // hit `->reactions` without a query.
            'reactions' => fn ($q) => $q->where('user_id', $author->id),
            'rsvps' => fn ($q) => $q->where('user_id', $author->id),
        ]);

        return $post;
    }
}
