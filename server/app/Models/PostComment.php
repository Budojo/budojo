<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\PostCommentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * `post_comments` (#600, M9). 1-level comments under a community
 * post — no nested replies (PRD hard rule). The body is capped at
 * 500 chars via the FormRequest layer, NOT in DDL (column is
 * `text` for SQLite portability).
 *
 * @property int          $id
 * @property int          $post_id
 * @property int          $user_id
 * @property string       $body
 * @property Carbon|null  $created_at
 * @property Carbon|null  $updated_at
 * @property Carbon|null  $deleted_at
 *
 * @property-read CommunityPost  $post
 * @property-read User           $user
 */
#[Fillable(['post_id', 'user_id', 'body'])]
class PostComment extends Model
{
    /** @use HasFactory<PostCommentFactory> */
    use HasFactory;

    use SoftDeletes;

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
}
