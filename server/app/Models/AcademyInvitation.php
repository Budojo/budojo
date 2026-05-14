<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\MembershipRole;
use Database\Factories\AcademyInvitationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Pending team invitation (#427 / #714).
 *
 * Terminal state (accept / revoke) HARD-DELETES the row — the
 * membership row itself is the canonical audit trail, this table is
 * append-and-delete. See `docs/specs/multi-user.md` § 5.2 for the
 * rationale (alternative would have been a partial unique index,
 * which MySQL 8 doesn't support).
 *
 * @property int                $id
 * @property int                $academy_id
 * @property string             $email           Target invitee — may not have an account yet.
 * @property MembershipRole     $role            Validation layer rejects `owner` (no transfer in v1).
 * @property string             $token_hash      SHA-256 of the raw URL token. Lookup constant-time.
 * @property int                $invited_by_user_id
 * @property Carbon             $expires_at
 * @property Carbon             $created_at
 * @property Carbon             $updated_at
 */
#[Fillable(['academy_id', 'email', 'role', 'token_hash', 'invited_by_user_id', 'expires_at'])]
class AcademyInvitation extends Model
{
    /** @use HasFactory<AcademyInvitationFactory> */
    use HasFactory;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return BelongsTo<User, $this> */
    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => MembershipRole::class,
            'expires_at' => 'datetime',
        ];
    }
}
