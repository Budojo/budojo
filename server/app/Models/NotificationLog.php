<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int                 $id
 * @property int                 $academy_id
 * @property string              $notification_type
 * @property \Carbon\Carbon      $sent_for_date
 * @property \Carbon\Carbon      $created_at
 */
#[Fillable(['academy_id', 'notification_type', 'sent_for_date'])]
class NotificationLog extends Model
{
    /**
     * Single-column timestamps — only `created_at` exists on this
     * table because a log row never gets updated after insert.
     * Disabling the UPDATED_AT magic prevents Eloquent from trying to
     * set a non-existent column on insert.
     */
    public const ?string UPDATED_AT = null;

    protected $table = 'notification_log';

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sent_for_date' => 'date',
            'created_at' => 'datetime',
        ];
    }
}
