<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Discriminator for the shape of `community_posts.payload` JSON (#600,
 * M9 community layer). Three first-class types in V1; new types arrive
 * with new sub-issues, never as an ad-hoc additional enum value.
 *
 * - `belt_promotion` — auto-generated when an athlete's belt changes
 *   (PR-B). Payload: `{ athlete_id, old_belt, new_belt, promoted_at }`.
 * - `event` — owner-created event post (PR-E). Payload carries title,
 *   description, starts_at, ends_at, location_text, location_address,
 *   location_lat, location_lon (the last two nullable in V1, populated
 *   in V2 cross-academy via geocoding), max_attendees.
 * - `owner_announcement` — reserved for V1 follow-up / V2. Free-form
 *   text body the owner posts in the academy feed. Kept in the enum
 *   from V1 so adding it later doesn't need a migration.
 */
enum CommunityPostType: string
{
    case BeltPromotion = 'belt_promotion';
    case Event = 'event';
    case OwnerAnnouncement = 'owner_announcement';
}
