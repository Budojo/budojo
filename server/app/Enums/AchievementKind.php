<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Achievement kinds shipped in V1 (#961). Deliberately small so each
 * rule can be tuned + i18n'd individually:
 *
 *  - FirstClass — first attendance row (event-driven via AttendanceObserver).
 *  - ThirtyDayStreak — 30 consecutive calendar days with ≥1 attendance.
 *  - HundredSessions — total attendance row count crosses 100.
 *  - OneYearAtAcademy — anniversary of athletes.joined_at hits +N years.
 *  - BeltPromotion — wraps an existing belt_promotion event so the
 *    badge surface stays consistent with the feed.
 */
enum AchievementKind: string
{
    case FirstClass = 'first_class';
    case ThirtyDayStreak = '30_day_streak';
    case HundredSessions = '100_sessions';
    case OneYearAtAcademy = '1_year_at_academy';
    case BeltPromotion = 'belt_promotion';
}
