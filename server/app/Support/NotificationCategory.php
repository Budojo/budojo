<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Catalogue of toggleable email-notification categories (#416).
 *
 * Each constant is the JSON key under `users.notification_preferences`
 * for that category. The dispatchers (Artisan commands + Mailable
 * sites) consult `NotificationPreferences::isEnabled` keyed by these
 * strings before queueing a digest / reminder email.
 *
 * **Not listed here**: transactional emails — `welcome`,
 * `password-reset`, `email-verification`,
 * `account-deletion-confirmation`, `account-deletion-cancel-link`,
 * `athlete-invitation`. Those are legally required or
 * security-load-bearing; the user cannot opt out of them and they
 * are NEVER gated by `notification_preferences`.
 *
 * **Adding a new category**: append a constant here, surface it on
 * the SPA preferences panel, and gate the dispatching site. The
 * default for any new category is "enabled" — `isEnabled` returns
 * true unless the JSON explicitly carries the key set to `false`.
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
     * Every category, in the order the SPA panel renders them.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return [
            self::MEDICAL_CERT_EXPIRY_REMINDERS,
            self::UNPAID_ATHLETES_DIGEST,
            self::COMMUNITY_REPLY,
        ];
    }
}
