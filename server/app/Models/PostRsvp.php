<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\RsvpResponse;
use Database\Factories\PostRsvpFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * `post_rsvps` (#600, M9). RSVP on an event-type community post —
 * one row per (post, user) tuple. The PR-E Action layer validates
 * that the target post is `type = 'event'` before insert; the FK is
 * generic at the DB level.
 *
 * @property int           $id
 * @property int           $post_id
 * @property int           $user_id
 * @property RsvpResponse  $response
 * @property Carbon|null   $created_at
 * @property Carbon|null   $updated_at
 *
 * @property-read CommunityPost  $post
 * @property-read User           $user
 */
#[Fillable(['post_id', 'user_id', 'response'])]
class PostRsvp extends Model
{
    /** @use HasFactory<PostRsvpFactory> */
    use HasFactory;

    /** @return BelongsTo<CommunityPost, $this> */
    public function post(): BelongsTo
    {
        return $this->belongsTo(CommunityPost::class, 'post_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'response' => RsvpResponse::class,
        ];
    }
}
