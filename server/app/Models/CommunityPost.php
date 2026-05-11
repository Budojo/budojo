<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use Database\Factories\CommunityPostFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * `community_posts` (#600, M9 community layer). Parent table for the
 * athlete-portal feed. See `docs/specs/m9-community.md` for the full
 * design rationale.
 *
 * The `payload` shape varies by `type`:
 *
 * - `belt_promotion` — `{ athlete_id, old_belt, new_belt, promoted_at }`
 * - `event` — `{ title, description, starts_at, ends_at?, location_text,
 *   location_address?, location_lat?, location_lon?, max_attendees? }`
 * - `owner_announcement` — `{ body }` (reserved for V1 follow-up / V2)
 *
 * @property int                         $id
 * @property int                         $academy_id
 * @property CommunityPostType           $type
 * @property CommunityPostVisibility     $visibility
 * @property array<string, mixed>        $payload
 * @property int                         $created_by_user_id
 * @property Carbon|null                 $created_at
 * @property Carbon|null                 $updated_at
 * @property Carbon|null                 $deleted_at
 *
 * @property-read Academy                                   $academy
 * @property-read User                                      $createdBy
 * @property-read \Illuminate\Database\Eloquent\Collection<int, PostReaction>  $reactions
 * @property-read \Illuminate\Database\Eloquent\Collection<int, PostComment>   $comments
 * @property-read \Illuminate\Database\Eloquent\Collection<int, PostRsvp>      $rsvps
 */
#[Fillable(['academy_id', 'type', 'visibility', 'payload', 'created_by_user_id'])]
class CommunityPost extends Model
{
    /** @use HasFactory<CommunityPostFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** @return HasMany<PostReaction, $this> */
    public function reactions(): HasMany
    {
        return $this->hasMany(PostReaction::class, 'post_id');
    }

    /** @return HasMany<PostComment, $this> */
    public function comments(): HasMany
    {
        return $this->hasMany(PostComment::class, 'post_id');
    }

    /** @return HasMany<PostRsvp, $this> */
    public function rsvps(): HasMany
    {
        return $this->hasMany(PostRsvp::class, 'post_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'type' => CommunityPostType::class,
            'visibility' => CommunityPostVisibility::class,
            'payload' => 'array',
        ];
    }
}
