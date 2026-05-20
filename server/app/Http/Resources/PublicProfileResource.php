<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-profile projection (#862, M9 social-profile epic slice A).
 *
 * Shapes the array returned by GetPublicProfileAction into the wire
 * envelope the SPA renders on `/dashboard/u/{handle}`. Mirrors the
 * field set documented in the epic body — first name only (no last
 * name in V1), handle, avatar, current belt, joined-at, promotions
 * timeline.
 *
 * The Action does all the data-shaping; this Resource is a humble
 * pass-through so PHPStan keeps the typed shape end-to-end without
 * needing to re-derive the Collection generic at the wire layer.
 *
 * @property array{
 *     id: int,
 *     first_name: string,
 *     handle: string,
 *     avatar_url: string|null,
 *     belt: string|null,
 *     joined_at: string|null,
 *     promotions: list<array{
 *         id: int,
 *         kind: 'belt'|'stripe',
 *         from_belt: string|null,
 *         to_belt: string|null,
 *         from_stripes: int|null,
 *         to_stripes: int|null,
 *         belt_at_event: string|null,
 *         recorded_at: string,
 *     }>,
 * } $resource
 */
class PublicProfileResource extends JsonResource
{
    /**
     * @return array{
     *     id: int,
     *     first_name: string,
     *     handle: string,
     *     avatar_url: string|null,
     *     belt: string|null,
     *     joined_at: string|null,
     *     promotions: list<array{
     *         id: int,
     *         kind: 'belt'|'stripe',
     *         from_belt: string|null,
     *         to_belt: string|null,
     *         from_stripes: int|null,
     *         to_stripes: int|null,
     *         belt_at_event: string|null,
     *         recorded_at: string,
     *     }>,
     * }
     */
    public function toArray(Request $request): array
    {
        return $this->resource;
    }
}
