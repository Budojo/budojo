<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\PendingEmailChangeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Pending email-change request (#476). One row at most per user (the
 * UNIQUE on `user_id` enforces this at the DB level); a fresh request
 * from the same user atomically replaces the previous row inside
 * `RequestEmailChangeAction`. The row exists between request-time and
 * confirm-time; on confirm `ConfirmEmailChangeAction` applies the
 * change to `users.email` and deletes this row in the same transaction.
 *
 * @property int          $id
 * @property int          $user_id
 * @property string       $new_email
 * @property string       $token       SHA-256 hex digest. The raw 64-char URL-safe token only ever exists in the verification email body; this column carries the hash.
 * @property Carbon       $expires_at
 * @property Carbon       $requested_at
 * @property Carbon       $created_at
 * @property Carbon       $updated_at
 *
 * @property-read User    $user
 */
#[Fillable(['user_id', 'new_email', 'token', 'expires_at', 'requested_at'])]
class PendingEmailChange extends Model
{
    /** @use HasFactory<PendingEmailChangeFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isActive(): bool
    {
        return $this->expires_at->isFuture();
    }

    /**
     * Hash a raw verification token before storing or comparing.
     *
     * The DB column carries the SHA-256 hex digest, NOT the raw token:
     * the token is a single-use bearer credential (clicking the link
     * IS the auth on the verify endpoint), so a DB read leak that
     * exposed plaintext would let an attacker redeem every pending
     * email-change immediately and silently flip the victim's login
     * email out from under them. Hashing makes the table harmless on
     * its own — the action hashes the URL-presented raw token and
     * looks up by hash.
     *
     * SHA-256 (rather than bcrypt) is sufficient here: the raw token
     * is 64 chars of CSPRNG output, so brute-force resistance comes
     * from the input entropy, not from a slow KDF. Mirrors the same
     * choice in `AthleteInvitation::hashToken()` so both bearer-
     * credential flows share one shape.
     */
    public static function hashToken(string $rawToken): string
    {
        return hash('sha256', $rawToken);
    }

    /**
     * Active rows — the request hasn't expired yet. Drives the
     * verify endpoint's "is this token still good?" lookup.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('expires_at', '>', now());
    }

    /**
     * Expired rows — feeds the scheduled cleanup command.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('expires_at', '<=', now());
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'requested_at' => 'datetime',
        ];
    }
}
