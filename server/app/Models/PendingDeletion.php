<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * GDPR-Art-17 grace-period record (#223). The presence of a row marks
 * the owning `User` as "pending hard-deletion" — see the issue body's
 * "Decisioni prese" for why the grace mechanism is a separate table
 * instead of a soft-delete on `users`.
 *
 * @property int                 $id
 * @property int                 $user_id
 * @property \Carbon\Carbon      $requested_at
 * @property \Carbon\Carbon      $scheduled_for
 * @property string              $confirmation_token
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 *
 * @property-read User $user
 */
class PendingDeletion extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'requested_at',
        'scheduled_for',
        'confirmation_token',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'scheduled_for' => 'datetime',
        ];
    }
}
