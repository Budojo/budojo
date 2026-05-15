<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property int          $id
 * @property string       $first_name         Given name. Required (NOT NULL); empty string never lands from a validated request — only the migration default for the few seconds between column-add and backfill.
 * @property string       $last_name          Family name. Required (NOT NULL, default ''). May legitimately be empty for a single-token migrated record (the user fixes on next profile visit).
 * @property string|null  $handle             Instagram-style user-chosen identifier (#479). 3-30 chars, lowercase `[a-z0-9_.]`, must start with a letter, no consecutive dots, no leading/trailing dot. Globally unique. Null until the user opts in via the profile page.
 * @property-read string  $full_name          Trimmed `first_name + ' ' + last_name`. Read-only accessor for surfaces (mailables, audit log) that still want a single string.
 * @property string       $email
 * @property Carbon|null  $email_verified_at  Set when the user clicks the signed verification link; null until then.
 * @property Carbon|null  $terms_accepted_at  Set on /auth/register when the user ticks the ToS gate (#420); null for pre-#420 / system-seeded accounts.
 * @property string|null  $avatar_path        Relative path on the `public` disk of the user's uploaded avatar (#411). Null until the first upload.
 * @property-read string|null $avatar_url     Public URL accessor for `avatar_path` — null when no avatar is set.
 * @property UserRole     $role               Persona discriminator (#445). `owner` for every public-register row; `athlete` only via the M7 invite flow.
 * @property string       $password
 * @property string|null  $remember_token
 * @property array<string, bool>|null $notification_preferences Per-category opt-out for digest / reminder emails (#416). Null = all categories enabled.
 * @property string|null  $two_factor_secret             Encrypted base32 TOTP secret (#412). Null when 2FA isn't enrolled.
 * @property array<int, string>|null $two_factor_recovery_codes Encrypted JSON array of single-use backup codes (#412).
 * @property Carbon|null  $two_factor_confirmed_at       Set when the user completes TOTP enrolment (#412). Null = 2FA not active.
 * @property Carbon|null  $onboarding_dismissed_at Set when the user explicitly skips the first-run guided tour (#424). Once non-null the SPA never re-renders the tour.
 * @property array<int, string>|null  $onboarding_completed_steps Step keys the user has ticked off on the "Getting started" checklist (#424). Null until first interaction.
 * @property int|null     $active_academy_id  Currently-selected academy (#427 / #714). Persists across sessions; FK to `academies.id` with `ON DELETE SET NULL`. Null until the user is added to their first membership.
 * @property int|null     $quiet_hours_start_local  Quiet-hours window start hour (0..23) in app timezone (#729 A3). Null = quiet hours off.
 * @property int|null     $quiet_hours_end_local    Quiet-hours window end hour (0..23) in app timezone (#729 A3). Null = quiet hours off.
 * @property Carbon       $created_at
 * @property Carbon       $updated_at
 */
#[Fillable(['first_name', 'last_name', 'handle', 'email', 'password', 'terms_accepted_at', 'avatar_path', 'role', 'notification_preferences', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at', 'onboarding_dismissed_at', 'onboarding_completed_steps', 'active_academy_id', 'quiet_hours_start_local', 'quiet_hours_end_local'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
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
     * The athlete row this user is linked to — populated only for
     * users with `role = athlete` (#445). For owners this is always
     * null. Reads `athletes.user_id` (FK on athletes); the inverse
     * is `Athlete::user()`.
     *
     * @return HasOne<Athlete, $this>
     */
    public function athlete(): HasOne
    {
        return $this->hasOne(Athlete::class);
    }

    public function isOwner(): bool
    {
        return $this->role === UserRole::Owner;
    }

    public function isAthlete(): bool
    {
        return $this->role === UserRole::Athlete;
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
     * Browser Web Push subscriptions (#419, #696). One row per device
     * the user has explicitly granted push permission on. The
     * `WebPushChannel` iterates this relation to fan out a notification
     * to every browser the user has opted in from.
     *
     * @return HasMany<PushSubscription, $this>
     */
    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    /**
     * Academy memberships (#427 / #714). One row per (user, academy)
     * pair the user has been added to. Includes soft-revoked rows;
     * callers that only want active memberships should `->whereNull
     * ('revoked_at')` or use `activeMembership()` below.
     *
     * @return HasMany<AcademyMembership, $this>
     */
    public function memberships(): HasMany
    {
        return $this->hasMany(AcademyMembership::class);
    }

    /**
     * The active (non-revoked) membership for the user's currently-
     * selected academy (`users.active_academy_id`). Returns null when
     * the pointer is unset, when the pointed-at academy was deleted
     * (FK `ON DELETE SET NULL`), or when the matching row is
     * soft-revoked.
     */
    public function activeMembership(): ?AcademyMembership
    {
        $activeId = $this->active_academy_id ?? null;
        if ($activeId === null) {
            return null;
        }

        return $this->memberships()
            ->where('academy_id', $activeId)
            ->whereNull('revoked_at')
            ->first();
    }

    /**
     * "Which academy am I currently operating in?" — the resolved
     * id, requiring a non-revoked membership at that academy. Falls
     * back to the first non-revoked membership when the pointer is
     * unset OR when the pointed-at membership has been revoked since
     * the user last selected it.
     *
     * The revoked-membership filter is load-bearing: without it a
     * user whose access to academy X was revoked could still
     * resolve X as their "active" academy and reach controllers /
     * Actions that gate on tenant scope alone (e.g. read paths).
     * Copilot review on #723 caught this.
     *
     * The fallback fires for newly-bootstrapped users (account
     * just created via owner registration) and for test scenarios
     * where the observer set the column but the in-memory User
     * instance is stale.
     */
    public function activeAcademyId(): ?int
    {
        if ($this->active_academy_id !== null) {
            $stillActive = $this->memberships()
                ->where('academy_id', $this->active_academy_id)
                ->whereNull('revoked_at')
                ->exists();
            if ($stillActive) {
                return $this->active_academy_id;
            }
        }

        /** @var AcademyMembership|null $first */
        $first = $this->memberships()->whereNull('revoked_at')->first();

        return $first?->academy_id;
    }

    /**
     * The hydrated Academy model for `activeAcademyId()` — null when
     * the user has no resolvable active academy. Use this in
     * controllers / Actions instead of the legacy `$user->academy`
     * hasOne relation (the latter only finds academies the user owns
     * via `academies.user_id`, which collapses to ONE academy and
     * doesn't know about admin / instructor / assistant membership).
     */
    public function activeAcademy(): ?Academy
    {
        $id = $this->activeAcademyId();
        if ($id === null) {
            return null;
        }

        return Academy::query()->find($id);
    }

    /**
     * Capability gate (#427 / #428 / #718). The single helper every
     * FormRequest's `authorize()` will go through after sub-issue 4/9
     * rewrites them. Resolves the user's active-and-not-revoked
     * membership in the target academy and delegates to
     * `RoleCapabilities::allows()`. Returns `false` when there is no
     * matching membership at all — capability checks against an
     * academy the user doesn't belong to are always denied.
     */
    public function canInAcademy(int $academyId, \App\Authorization\Capability $capability): bool
    {
        /** @var AcademyMembership|null $membership */
        $membership = $this->memberships()
            ->where('academy_id', $academyId)
            ->whereNull('revoked_at')
            ->first();

        if ($membership === null) {
            return false;
        }

        return \App\Authorization\RoleCapabilities::allows($membership->role, $capability);
    }

    /**
     * Email-change-with-verification pending row (#476). At most one
     * row exists at a time per user (DB UNIQUE on `user_id`). Presence
     * ⇒ the user has requested an email change but hasn't clicked the
     * verification link yet — `users.email` stays the OLD address until
     * confirmation, the candidate lives on the pending row.
     *
     * @return HasOne<PendingEmailChange, $this>
     */
    public function pendingEmailChange(): HasOne
    {
        return $this->hasOne(PendingEmailChange::class);
    }

    /**
     * Public URL of the avatar — `null` when none is set (#411). Mirrors the
     * shape of `AcademyResource::logo_url` (resolves through `Storage::disk
     * ('public')->url(...)`) so the SPA contract stays uniform: the wire
     * always carries the URL, never the raw on-disk path. The Resource
     * layer is the boundary; downstream callers read `avatar_url`.
     *
     * **Cache-busting query param.** Same-extension replacements overwrite
     * the underlying file in place, so the URL string would otherwise stay
     * identical and the browser would happily serve the old bitmap from
     * cache. We append `?v={updated_at-timestamp}` so the URL changes the
     * moment the row is touched (any `forceFill().save()` bumps `updated_at`).
     * The query string carries no PII and survives copy-paste — the
     * underlying storage URL is unchanged for a non-cache consumer.
     */
    public function getAvatarUrlAttribute(): ?string
    {
        if ($this->avatar_path === null) {
            return null;
        }

        $url = Storage::disk('public')->url($this->avatar_path);
        // `avatar_path` only gets set after `forceFill().save()`, so
        // `updated_at` is guaranteed populated by the time we land
        // here — PHPStan's @property-driven non-null view is sound.
        $version = $this->updated_at->getTimestamp();

        return $url . '?v=' . $version;
    }

    /**
     * Trimmed `first_name + ' ' + last_name` for the surfaces (mailables,
     * audit logs, account-deletion confirmation) that still want a
     * single string. Greeting surfaces should prefer `first_name`
     * directly — this accessor is the formal-letter shape, not the
     * conversational one. Read-only; mutating `full_name` is a no-op
     * by design — first/last are the source of truth.
     *
     * @return Attribute<string, never>
     */
    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn (): string => trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? '')),
        );
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
            'role' => UserRole::class,
            // Per-category opt-out preferences for digest / reminder
            // emails (#416). Keys are category strings (see
            // `App\Support\NotificationCategory`), values are booleans
            // — `false` = opted out, `true` (or absent) = enabled.
            'notification_preferences' => 'array',
            // 2FA columns (#412). `encrypted` ensures DB-dump leaks
            // don't expose usable secrets; `encrypted:array` does
            // the same for the JSON backup-codes column. The
            // `confirmed_at` timestamp is the load-bearing "is 2FA
            // active" gate.
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
            // First-run onboarding state (#424).
            'onboarding_dismissed_at' => 'datetime',
            'onboarding_completed_steps' => 'array',
        ];
    }
}
