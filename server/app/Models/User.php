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
use Laravel\Sanctum\HasApiTokens;

/**
 * @property int          $id
 * @property string       $name
 * @property string       $email
 * @property Carbon|null  $email_verified_at  Set when the user clicks the signed verification link; null until then.
 * @property string       $password
 * @property string|null  $remember_token
 * @property Carbon       $created_at
 * @property Carbon       $updated_at
 */
#[Fillable(['name', 'email', 'password'])]
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
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
