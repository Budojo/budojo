<?php

declare(strict_types=1);

namespace App\Authorization;

use App\Enums\MembershipRole;

/**
 * Single source of truth for the (role × capability) authz matrix
 * (#427 / #428). Every FormRequest's `authorize()` ultimately bottoms
 * out here through `User::canInAcademy()` (sub-issue 3/9). PRD § 4
 * has the human-readable version of the same table.
 *
 * **Why a static method on a `final` class and not a singleton or
 * registry**: the matrix is constant data, doesn't change at runtime,
 * doesn't need DI or test-time swapping. A static lookup keeps the
 * call sites readable (`RoleCapabilities::allows($role, $cap)`) and
 * makes the matrix definition the only thing a reviewer needs to read
 * to know what's allowed where.
 *
 * **Drift protection** (code-level only): `RoleCapabilitiesTest`
 * compares `self::MATRIX` against a hand-mirrored copy of PRD § 4
 * declared in the test file, plus meta-tests for orphan capabilities
 * and orphan role keys. This catches:
 *
 *   - Adding a `Capability` case without granting it to any role.
 *   - Editing `self::MATRIX` without updating the test mirror (and
 *     vice-versa).
 *
 * It does NOT catch a markdown-only edit to PRD § 4 — the
 * `docs/specs/multi-user.md` file isn't parsed by the test suite.
 * Spec-vs-code consistency review stays a reviewer responsibility
 * when only one side moves.
 */
final class RoleCapabilities
{
    /**
     * The capability matrix from PRD § 4. Keys are `MembershipRole`
     * backing strings; values are the list of `Capability` backing
     * strings allowed for that role.
     *
     * @var array<string, list<string>>
     */
    private const MATRIX = [
        // Owner: everything. Owner-only capability is `team_change_role`
        // (changing other members' roles).
        'owner' => [
            'academy_settings_read', 'academy_settings_update',
            'team_list', 'team_invite', 'team_revoke', 'team_change_role',
            'athletes_read', 'athletes_create_update', 'athletes_delete', 'athletes_restore',
            'documents_read', 'documents_upload', 'documents_delete',
            'attendance_read', 'attendance_record',
            'payments_read', 'payments_mark_paid', 'payments_mark_unpaid',
            'promotions_record',
            'community_post_event', 'community_feed_interact',
            'stats_view',
        ],
        // Admin: owner minus `team_change_role`. Co-runs the academy
        // but can't promote anyone to admin/owner.
        'admin' => [
            'academy_settings_read', 'academy_settings_update',
            'team_list', 'team_invite', 'team_revoke',
            'athletes_read', 'athletes_create_update', 'athletes_delete', 'athletes_restore',
            'documents_read', 'documents_upload', 'documents_delete',
            'attendance_read', 'attendance_record',
            'payments_read', 'payments_mark_paid', 'payments_mark_unpaid',
            'promotions_record',
            'community_post_event', 'community_feed_interact',
            'stats_view',
        ],
        // Instructor: teaches classes, records attendance + promotions,
        // creates/updates athletes (but no delete / restore / settings
        // / team-admin), can mark paid (but not unpaid).
        'instructor' => [
            'academy_settings_read',
            'team_list',
            'athletes_read', 'athletes_create_update',
            'documents_read', 'documents_upload',
            'attendance_read', 'attendance_record',
            'payments_read', 'payments_mark_paid',
            'promotions_record',
            'community_post_event', 'community_feed_interact',
            'stats_view',
        ],
        // Assistant (front-desk): read everything roster-related, plus
        // record attendance + mark paid. No create / delete / settings
        // / promotions / community-post.
        'assistant' => [
            'academy_settings_read',
            'team_list',
            'athletes_read',
            'documents_read',
            'attendance_read', 'attendance_record',
            'payments_read', 'payments_mark_paid',
            'community_feed_interact',
            'stats_view',
        ],
    ];

    /**
     * Returns true when the given role is allowed to exercise the
     * given capability. Backed by `self::MATRIX`; PRD § 4 is the
     * human-readable mirror.
     */
    public static function allows(MembershipRole $role, Capability $capability): bool
    {
        return \in_array(
            $capability->value,
            self::MATRIX[$role->value],
            true,
        );
    }

    /**
     * Lists every capability granted to the role. Useful for the
     * `/auth/me` response that ships the matrix to the SPA for the
     * `*budojoCan` directive (sub-issue 9/9).
     *
     * @return list<Capability>
     */
    public static function capabilitiesFor(MembershipRole $role): array
    {
        $raw = self::MATRIX[$role->value];

        return array_map(static fn (string $v): Capability => Capability::from($v), $raw);
    }

    /**
     * The full matrix as a `MembershipRole → list<Capability>` array.
     * Used by the meta-test in `RoleCapabilitiesTest` to walk every
     * cell, and by the `/auth/me` ship-the-matrix-to-the-SPA path.
     *
     * @return array<value-of<MembershipRole>, list<Capability>>
     */
    public static function matrix(): array
    {
        /** @var array<value-of<MembershipRole>, list<Capability>> $out */
        $out = [];
        foreach (self::MATRIX as $roleValue => $capValues) {
            $out[$roleValue] = array_map(
                static fn (string $v): Capability => Capability::from($v),
                $capValues,
            );
        }

        return $out;
    }
}
