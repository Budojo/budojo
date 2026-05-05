<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\AthleteInvitationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Token-based invitation row that lets an academy owner onboard a
 * roster athlete to the SPA (#445). Lifecycle is encoded as a triplet
 * of nullable timestamps:
 *
 * - `accepted_at` — set in `AcceptAthleteInvitationAction` when the
 *   athlete clicks the link, sets a password, ticks ToS / privacy.
 * - `revoked_at`  — set by the owner if the invite was sent in error
 *   or to the wrong address.
 * - `expires_at`  — populated at insert time (default 7 days out).
 *
 * Helpers + scopes encapsulate the "what state is this row in" logic
 * so callers don't litter the codebase with stale-by-construction
 * boolean checks.
 *
 * @property int          $id
 * @property int          $athlete_id
 * @property int          $academy_id
 * @property int          $sent_by_user_id
 * @property string       $email
 * @property string       $token
 * @property Carbon       $expires_at
 * @property Carbon|null  $accepted_at
 * @property Carbon|null  $revoked_at
 * @property Carbon|null  $last_sent_at
 * @property Carbon       $created_at
 * @property Carbon       $updated_at
 *
 * @property-read Athlete $athlete
 * @property-read Academy $academy
 * @property-read User    $sentBy
 */
#[Fillable(['athlete_id', 'academy_id', 'sent_by_user_id', 'email', 'token', 'expires_at', 'accepted_at', 'revoked_at', 'last_sent_at'])]
class AthleteInvitation extends Model
{
    /** @use HasFactory<AthleteInvitationFactory> */
    use HasFactory;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return BelongsTo<User, $this> */
    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }

    public function isAccepted(): bool
    {
        return $this->accepted_at !== null;
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    /**
     * Mutually exclusive with `isAccepted()` and `isRevoked()`. A row
     * past its `expires_at` that was already accepted or revoked
     * stays in its terminal state — "expired" describes the
     * "ran out of time before anyone touched it" branch only.
     */
    public function isExpired(): bool
    {
        return ! $this->isAccepted()
            && ! $this->isRevoked()
            && $this->expires_at->isPast();
    }

    /**
     * Pending = not accepted, not revoked, expiry in the future.
     * The four lifecycle helpers (`isPending`, `isAccepted`,
     * `isRevoked`, `isExpired`) are pairwise mutually exclusive —
     * every row is in exactly one state at all times.
     */
    public function isPending(): bool
    {
        return ! $this->isAccepted()
            && ! $this->isRevoked()
            && $this->expires_at->isFuture();
    }

    /**
     * Hash a raw invitation token before storing or comparing.
     *
     * The DB column carries the SHA-256 hex digest, NOT the raw
     * token: the token is a single-use bearer credential (clicking
     * the link IS the auth on the accept endpoint), so a DB read
     * leak that exposed plaintext would let an attacker redeem
     * every pending invite immediately. Hashing makes the table
     * harmless on its own — the action hashes the URL-presented
     * raw token and looks up by hash.
     *
     * SHA-256 (rather than bcrypt) is sufficient here: the raw
     * token is 64 chars of CSPRNG output, so brute-force resistance
     * comes from the input entropy, not from a slow KDF.
     */
    public static function hashToken(string $rawToken): string
    {
        return hash('sha256', $rawToken);
    }

    /**
     * Pending invites — useful for "resend if pending exists" lookups
     * on the action-side and for the owner-side athlete detail page.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopePending(Builder $query): Builder
    {
        return $query
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now());
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeExpired(Builder $query): Builder
    {
        return $query
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->where('expires_at', '<=', now());
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_sent_at' => 'datetime',
        ];
    }
}
