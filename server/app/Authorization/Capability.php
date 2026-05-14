<?php

declare(strict_types=1);

namespace App\Authorization;

/**
 * Capability tokens that drive every authz check across the
 * multi-user epic (#427 / #428).
 *
 * Each case corresponds to a single row of the capability matrix in
 * `docs/specs/multi-user.md` § 4. Adding a new capability means:
 *
 *   1. add a case here,
 *   2. add the matching entry to every row of
 *      `RoleCapabilities::MATRIX`,
 *   3. update PRD § 4 in the same commit.
 *
 * The `RoleCapabilitiesTest` test catches code-level drift (a new
 * `Capability` case without a `MATRIX` entry, or a `MATRIX` row that
 * disagrees with the test's own hard-coded mirror of PRD § 4).
 * Updating the markdown table without also updating the test's
 * mirror is NOT caught automatically — we don't parse the markdown
 * — so the spec-vs-code review burden stays on the reviewer.
 *
 * **Naming convention**: `NounAction` (PascalCase enum case),
 * `noun_action` (backing string). The grouping noun is plural
 * (`Athletes`, `Documents`) when the capability touches a collection
 * — singular only when the surface is a singleton (`AcademySettings`).
 */
enum Capability: string
{
    // Academy settings
    case AcademySettingsRead = 'academy_settings_read';
    case AcademySettingsUpdate = 'academy_settings_update';

    // Team management
    case TeamList = 'team_list';
    case TeamInvite = 'team_invite';
    case TeamRevoke = 'team_revoke';
    case TeamChangeRole = 'team_change_role';

    // Athletes
    case AthletesRead = 'athletes_read';
    case AthletesCreateUpdate = 'athletes_create_update';
    case AthletesDelete = 'athletes_delete';
    case AthletesRestore = 'athletes_restore';

    // Documents
    case DocumentsRead = 'documents_read';
    case DocumentsUpload = 'documents_upload';
    case DocumentsDelete = 'documents_delete';

    // Attendance
    case AttendanceRead = 'attendance_read';
    case AttendanceRecord = 'attendance_record';

    // Payments
    case PaymentsRead = 'payments_read';
    case PaymentsMarkPaid = 'payments_mark_paid';
    case PaymentsMarkUnpaid = 'payments_mark_unpaid';

    // Promotions
    case PromotionsRecord = 'promotions_record';

    // Community
    case CommunityPostEvent = 'community_post_event';
    case CommunityFeedInteract = 'community_feed_interact';

    // Stats
    case StatsView = 'stats_view';
}
