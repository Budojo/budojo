<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable audit log row (#429). One entry per audited action
 * across the academy. Append-only: this Model does NOT carry the
 * standard `timestamps` pair — only `created_at` is set at insert
 * and frozen.
 *
 * @property int                 $id
 * @property int|null            $actor_user_id
 * @property string|null         $actor_label
 * @property int|null            $academy_id
 * @property string              $action
 * @property string|null         $subject_type
 * @property int|null            $subject_id
 * @property string|null         $subject_label
 * @property array<string,mixed>|null $before
 * @property array<string,mixed>|null $after
 * @property string|null         $ip
 * @property string|null         $user_agent
 * @property \Carbon\Carbon      $created_at
 */
#[Fillable([
    'actor_user_id',
    'actor_label',
    'academy_id',
    'action',
    'subject_type',
    'subject_id',
    'subject_label',
    'before',
    'after',
    'ip',
    'user_agent',
])]
class AuditEntry extends Model
{
    /**
     * Append-only. Laravel's default `$timestamps = true` would expect
     * an `updated_at` column we deliberately omitted; flipping the
     * flag off keeps `created_at` populated at insert via the migration's
     * `useCurrent()` default + lets Eloquent skip the `updated_at` write.
     */
    public $timestamps = false;

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

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
            'before' => 'array',
            'after' => 'array',
            'created_at' => 'datetime',
        ];
    }
}
