<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\LoginAttemptFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Read-only login attempt record (#430). Skinny by design — relations
 * + casts only, no business logic. Writing happens through
 * `RecordLoginAttemptAction`; reading happens through the
 * `LoginHistoryController`.
 *
 * @property int          $id
 * @property int|null     $user_id
 * @property string       $email_attempted
 * @property string|null  $ip_address
 * @property string|null  $user_agent
 * @property bool         $success
 * @property Carbon       $created_at
 * @property-read User|null $user
 */
class LoginAttempt extends Model
{
    /** @use HasFactory<LoginAttemptFactory> */
    use HasFactory;

    /**
     * No `updated_at` — login attempts are immutable. The migration
     * uses a single `created_at` column rather than the default
     * `timestamps()` pair, so we disable Eloquent's automatic
     * `updated_at` handling here.
     */
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'email_attempted',
        'ip_address',
        'user_agent',
        'success',
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
            'success' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    /**
     * The user-typed email is lowercased server-side at insert time
     * (mirrors the canonical user.email casing) so list views and
     * filters compare apples-to-apples regardless of how the form
     * was filled out.
     *
     * Read-side cast as a defensive belt for any pre-existing rows
     * where the lowercase wasn't applied.
     */
    /** @return Attribute<string|null, string|null> */
    protected function emailAttempted(): Attribute
    {
        return Attribute::make(
            set: static fn (?string $value): ?string => $value === null ? null : strtolower($value),
        );
    }
}
