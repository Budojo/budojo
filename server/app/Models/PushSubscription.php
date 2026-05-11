<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\PushSubscriptionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Web Push subscription tied to a user + browser device (#419).
 * Stored verbatim from the W3C PushSubscription JSON envelope so the
 * `minishlink/web-push` library can reconstruct the auth key on the
 * server side at fanout time.
 *
 * @property int          $id
 * @property int          $user_id
 * @property string       $endpoint        Vendor push-service URL (FCM/Mozilla/Apple Push).
 * @property string       $endpoint_hash   SHA-256 of `endpoint`; backs the unique index.
 * @property string       $p256dh          Base64url-encoded P-256 ECDH public key.
 * @property string       $auth            Base64url-encoded auth secret.
 * @property \Carbon\Carbon|null $last_seen_at Bumped on every successful delivery.
 * @property \Carbon\Carbon $created_at
 * @property \Carbon\Carbon $updated_at
 */
#[Fillable(['user_id', 'endpoint', 'endpoint_hash', 'p256dh', 'auth', 'last_seen_at'])]
class PushSubscription extends Model
{
    /** @use HasFactory<PushSubscriptionFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
        ];
    }
}
