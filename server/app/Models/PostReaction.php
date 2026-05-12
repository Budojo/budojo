<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ReactionEmoji;
use Database\Factories\PostReactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * `post_reactions` (#600, M9). Emoji react on a community post —
 * one row per (post, user) tuple. Toggling between emojis on the
 * same post replaces the row (handled in the PR-C Action layer).
 *
 * No soft-delete + no `updated_at` — reactions are append/remove,
 * not edit. `created_at` only.
 *
 * @property int            $id
 * @property int            $post_id
 * @property int            $user_id
 * @property ReactionEmoji  $emoji
 * @property Carbon|null    $created_at
 *
 * @property-read CommunityPost  $post
 * @property-read User           $user
 */
#[Fillable(['post_id', 'user_id', 'emoji'])]
class PostReaction extends Model
{
    /** @use HasFactory<PostReactionFactory> */
    use HasFactory;

    /**
     * Reactions don't track updated_at — append/remove only.
     */
    public const UPDATED_AT = null;

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
            'emoji' => ReactionEmoji::class,
        ];
    }
}
