<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\MembershipRole;
use Database\Factories\AcademyMembershipFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Per-(user, academy) membership row (#427 / #714).
 *
 * @property int                $id
 * @property int                $user_id
 * @property int                $academy_id
 * @property MembershipRole     $role
 * @property Carbon             $joined_at
 * @property Carbon|null        $revoked_at   Soft-revoke: row stays for the audit trail; the active-memberships scope filters `WHERE revoked_at IS NULL`.
 * @property Carbon             $created_at
 * @property Carbon             $updated_at
 */
#[Fillable(['user_id', 'academy_id', 'role', 'joined_at', 'revoked_at'])]
class AcademyMembership extends Model
{
    /** @use HasFactory<AcademyMembershipFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /**
     * True when the membership is currently active (the user is
     * actually part of the academy right now). False after a revoke;
     * flips back to true if the membership is re-instated.
     */
    public function isActive(): bool
    {
        return $this->revoked_at === null;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => MembershipRole::class,
            'joined_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }
}
