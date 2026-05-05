<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property int          $id
 * @property string       $name
 * @property string       $email
 * @property Carbon|null  $email_verified_at  Set when the user clicks the signed verification link; null until then.
 * @property Carbon|null  $terms_accepted_at  Set on /auth/register when the user ticks the ToS gate (#420); null for pre-#420 / system-seeded accounts.
 * @property string|null  $avatar_path        Relative path on the `public` disk of the user's uploaded avatar (#411). Null until the first upload.
 * @property-read string|null $avatar_url     Public URL accessor for `avatar_path` — null when no avatar is set.
 * @property string       $password
 * @property string|null  $remember_token
 * @property Carbon       $created_at
 * @property Carbon       $updated_at
 */
#[Fillable(['name', 'email', 'password', 'terms_accepted_at', 'avatar_path'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens;

    /** @use HasFactory<UserFactory> */
    use HasFactory;

    use Notifiable;

    /** @return HasOne<Academy, $this> */
    public function academy(): HasOne
    {
        return $this->hasOne(Academy::class);
    }

    /**
     * GDPR-Art-17 right-to-erasure grace-period record (#223). At most
     * one row exists at a time per user. Presence ⇒ account is in the
     * 30-day pending-deletion window.
     *
     * @return HasOne<PendingDeletion, $this>
     */
    public function pendingDeletion(): HasOne
    {
        return $this->hasOne(PendingDeletion::class);
    }

    /**
     * Public URL of the avatar — `null` when none is set (#411). Mirrors the
     * shape of `AcademyResource::logo_url` (resolves through `Storage::disk
     * ('public')->url(...)`) so the SPA contract stays uniform: the wire
     * always carries the URL, never the raw on-disk path. The Resource
     * layer is the boundary; downstream callers read `avatar_url`.
     */
    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path !== null
            ? Storage::disk('public')->url($this->avatar_path)
            : null;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'terms_accepted_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
