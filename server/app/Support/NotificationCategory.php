<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Catalogue of toggleable notification categories (#416, extended
 * for in-app inbox + push channels by M9 PR-F).
 *
 * Each constant is the JSON key under `users.notification_preferences`
 * for that category. The dispatchers (Artisan commands for email
 * digests, Action-layer fanout for inbox-channel notifications, the
 * future Web Push worker) consult `NotificationPreferences::isEnabled`
 * keyed by these strings before delivering. Originally email-only
 * (M5); now multi-channel — each constant's docblock spells out
 * which channel it ships on.
 *
 * **Not listed here**: transactional emails — `welcome`,
 * `password-reset`, `email-verification`,
 * `account-deletion-confirmation`, `account-deletion-cancel-link`,
 * `athlete-invitation`. Those are legally required or
 * security-load-bearing; the user cannot opt out of them and they
 * are NEVER gated by `notification_preferences`.
 *
 * **Adding a new category**: append a constant here, surface it on
 * the SPA preferences panel, and gate the dispatching site. By
 * default `isEnabled` returns `true` for absent keys (GDPR soft-
 * opt-in posture). Categories with a wider blast radius —
 * e.g. every-academy broadcasts — can flip the absent-key
 * fallback to `false` by adding their key to the
 * `defaultOff()` list; the SPA panel surfaces them with an
 * "Off by default" cue in the description copy.
 */
final class NotificationCategory
{
    /**
     * Daily digest of medical certificates expiring at T-30 / T-7 /
     * T-0, sent to the academy owner. Dispatched by
     * `SendMedicalCertExpiryReminders`.
     */
    public const string MEDICAL_CERT_EXPIRY_REMINDERS = 'medical_cert_expiry_reminders';

    /**
     * Monthly digest of athletes still unpaid for the current month,
     * sent to the academy owner on the 16th. Dispatched by
     * `SendUnpaidAthletesDigest`.
     */
    public const string UNPAID_ATHLETES_DIGEST = 'unpaid_athletes_digest';

    /**
     * Inbox notification fired when someone posts a sibling comment
     * under a community post that you previously commented on
     * (M9 PR-F slice 1, #606). The author of the new comment is
     * never notified. Default-on like the rest of M5's matrix.
     */
    public const string COMMUNITY_REPLY = 'community_reply';

    /**
     * Inbox notification fired when ANY athlete in the user's
     * academy is promoted to a new belt (M9 PR-F slice 3, #606).
     * The editor who recorded the promotion is excluded from the
     * fanout. Default-**off** per the PRD — the every-athlete
     * blast radius is wide enough that an explicit opt-in is the
     * right posture; the SPA panel surfaces it with a clear
     * "Off by default" hint.
     */
    public const string COMMUNITY_BELT_CELEBRATION = 'community_belt_celebration';

    /**
     * Inbox notification fired when the academy owner creates a new
     * event-type community post (M9 PR-F slice 2, #606). Recipients
     * are every academy user — athletes linked to a `user_id` (invite-
     * pending rows skipped) PLUS the academy owner — minus the editor.
     * Owner-side participation in the community surface landed in
     * #639. Default-on: events are deliberate, relatively rare, and
     * the academy roster opted in by joining the academy.
     *
     * **Deprecation path** (#729 A5): now a subset of
     * `COMMUNITY_NEW_POST` which fires on ANY new community post type.
     * Keep both during the v2.16 → v2.17 transition; a follow-up
     * cleanup PR will collapse them once telemetry confirms no drift.
     */
    public const string COMMUNITY_EVENT_NEW = 'community_event_new';

    /**
     * Owner-side inbox notification — fires the moment an athlete the
     * owner had on their roster completes signup (`AthleteInvitation`
     * accept OR `athletes.user_id` flips from null to set via the
     * legacy manual-link path). Recipients = the academy owner. The
     * just-signed-up athlete is never notified — they're on the page
     * already (#729 A1).
     */
    public const string ATHLETE_SIGNED_UP = 'athlete_signed_up';

    /**
     * Athlete-side push reminder — fires once per training-scheduled
     * day at the local 07:00 wake-up window, ONLY if the athlete has
     * not already been marked present for the day (so a 6:30am open-
     * mat athlete doesn't get a redundant ping at 7:00). Recipients =
     * every athlete whose academy `training_days` includes today
     * AND who has no `attendance_records` row for today (#729 A2).
     */
    public const string ATHLETE_TRAINING_TODAY = 'athlete_training_today';

    /**
     * Inbox notification fired when ANY new community post lands in
     * the user's academy (event, belt-promotion auto-post, future post
     * types). Superset of `COMMUNITY_EVENT_NEW` and `COMMUNITY_BELT_
     * CELEBRATION`'s notification trigger. Recipients = every active
     * member of the post's academy minus the author (#729 A5).
     */
    public const string COMMUNITY_NEW_POST = 'community_new_post';

    /**
     * Inbox notification fired when someone comments on a post YOU
     * authored. Distinct from `COMMUNITY_REPLY` (which fires on
     * sibling comments under a thread you participate in) — this
     * pings the post author specifically (#729 A6).
     */
    public const string COMMUNITY_COMMENT_ON_YOUR_POST = 'community_comment_on_your_post';

    /**
     * Inbox notification fired when someone reacts (clap / pray) on
     * a post YOU authored. Reactor never self-pings. Implementation
     * note: production may want a debounce / coalesce window before
     * we land a "5 people reacted" digest variant — flagged in #729
     * A7 implementation discussion (#729 A7).
     */
    public const string COMMUNITY_REACTION_ON_YOUR_POST = 'community_reaction_on_your_post';

    /**
     * Every category, in the order the SPA panel renders them.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return [
            self::MEDICAL_CERT_EXPIRY_REMINDERS,
            self::UNPAID_ATHLETES_DIGEST,
            self::ATHLETE_SIGNED_UP,
            self::ATHLETE_TRAINING_TODAY,
            self::COMMUNITY_REPLY,
            self::COMMUNITY_NEW_POST,
            self::COMMUNITY_COMMENT_ON_YOUR_POST,
            self::COMMUNITY_REACTION_ON_YOUR_POST,
            self::COMMUNITY_BELT_CELEBRATION,
            self::COMMUNITY_EVENT_NEW,
        ];
    }

    /**
     * Categories that DEFAULT to off — the user has to opt in. Every
     * other category defaults to enabled (the M5 GDPR soft-opt-in
     * posture). Used by `NotificationPreferences::isEnabled` to
     * decide the absent-key fallback.
     *
     * @return array<int, string>
     */
    public static function defaultOff(): array
    {
        return [self::COMMUNITY_BELT_CELEBRATION];
    }
}
