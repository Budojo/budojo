<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\SupportTicketCategory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Persisted record of a support ticket submission (#423). The row is
 * the audit trail; the side-effect (a queued email to the support
 * inbox) is what actually opens the support thread.
 *
 * Only `created_at` is meaningful — ticket rows are immutable from the
 * user's perspective, so `updated_at` is intentionally absent (see the
 * migration's column list).
 *
 * @property int                          $id
 * @property int|null                     $user_id  Nullable to support the planned logged-out fallback path.
 * @property string                       $subject
 * @property SupportTicketCategory        $category
 * @property string                       $body
 * @property Carbon                       $created_at
 *
 * @property-read User|null $user
 */
#[Fillable(['user_id', 'subject', 'category', 'body'])]
class SupportTicket extends Model
{
    /**
     * Only `created_at` exists on this table — disable Eloquent's
     * default `updated_at` write so saves don't try to set a column
     * the schema doesn't have.
     */
    public const UPDATED_AT = null;

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'category' => SupportTicketCategory::class,
            'created_at' => 'datetime',
        ];
    }
}
