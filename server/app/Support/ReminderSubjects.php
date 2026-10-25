<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\AthleteStatus;
use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Document;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * Whom and what each of the owner's reminders is about: one selection, read by
 * two senders. The commands send a reminder on its day (#1226), when the PC's
 * schedule runs with the app open. The phone's forecast (#2047) hands the days
 * ahead to Android, because nothing runs on a phone with the app closed. Both
 * read it here, so the phone never reminds of something the PC would not.
 *
 * Delivery stays with each sender: the PC's claims, mail and opt-out per run,
 * and the phone's times and keys.
 */
final class ReminderSubjects
{
    /** The missed streak: the last this many scheduled sessions, all missed. */
    public const int STREAK_LENGTH = 3;
    /**
     * A paper is reminded of a month before it expires, a week before, and on
     * the day: the cadence of the dashboard's expiring list.
     */
    private const array EXPIRY_OFFSETS = [0, 7, 30];

    /**
     * How far back the streak may reach. Thirty days holds three sessions even
     * for an academy that trains weekly; a streak older than that is about a
     * schedule that stopped (a pause, a not-configured period), not about the
     * athlete, and warning about it would repeat every fortnight of the pause.
     */
    private const int STREAK_REACH_DAYS = 30;

    /**
     * The expiry dates a reminder on `$day` is about: the day itself, a week
     * on, and a month on.
     *
     * @return list<string>
     */
    public static function expiryDates(CarbonInterface $day): array
    {
        return array_map(
            static fn (int $offset): string => $day->copy()->addDays($offset)->toDateString(),
            self::EXPIRY_OFFSETS,
        );
    }

    /**
     * The medical certificates expiring on one of the dates.
     *
     * The `expires_at` column is `date`; on SQLite (the test driver) a
     * `WHERE expires_at IN (?, ?, ?)` against ISO date strings is unreliable
     * when the model's cast normalises the stored representation. Use
     * OR-orWhereDate so the database does the comparison against the date
     * portion explicitly, matching regardless of any datetime-vs-date
     * subtlety in the storage round-trip.
     *
     * A certificate the athlete has already renewed is not a reminder
     * (#1739). Early renewal is the normal case — a month before the old one
     * lapses — and without this the owner still got a T-30, a T-7 and a T-0
     * telling them to chase a certificate sitting in the athlete's own
     * documents tab.
     *
     * Active athletes only, for the same reason the expiring list uses
     * (#1740) — and because the digest links to that list. Chasing an athlete
     * who stopped training was already noise; once the list stopped showing
     * them, the reminder pointed the owner at a page reading "All documents up
     * to date" about the very row it named.
     *
     * @param  list<string>  $dates  ISO dates, from `expiryDates()`.
     * @return Collection<int, Document>
     */
    public static function medicalCertificates(Academy $academy, array $dates): Collection
    {
        return Document::query()
            ->whereHas('athlete', fn ($q) => $q
                ->where('academy_id', $academy->id)
                ->where('status', AthleteStatus::Active->value))
            ->where('type', DocumentType::MedicalCertificate)
            ->notSuperseded()
            ->where(function ($q) use ($dates): void {
                foreach ($dates as $date) {
                    $q->orWhereDate('expires_at', $date);
                }
            })
            ->with('athlete')
            ->orderBy('expires_at', 'asc')
            ->get();
    }

    /**
     * The academy's own papers (#1743) expiring on one of the dates.
     *
     * `academy->documents()` is the academy's OWN papers — rows with a null
     * `athlete_id`. An athlete's medical certificate reaches the owner through
     * the other reminder, and a document must not produce two reminders for
     * one expiry.
     *
     * @param  list<string>  $dates  ISO dates, from `expiryDates()`.
     * @return Collection<int, Document>
     */
    public static function academyDocuments(Academy $academy, array $dates): Collection
    {
        return $academy->documents()
            ->whereNotNull('expires_at')
            ->where(function ($q) use ($dates): void {
                foreach ($dates as $date) {
                    $q->orWhereDate('expires_at', $date);
                }
            })
            ->orderBy('expires_at', 'asc')
            ->get();
    }

    /**
     * The athletes who owe the month, by the roster's own rule
     * (`Athlete::scopeOwing`, #1722): a carnet holder is not chased, and
     * neither is the owner's own row or an athlete charged no fee.
     *
     * None at all in an academy that charges no fee (#404): there payments
     * are off the books, and a monthly chase is noise. "Charges a fee" means
     * a flat fee, a price list (#1381) or an athlete with a personal fee above
     * zero (#1757): an academy that prices only by tier, or only by person,
     * leaves `monthly_fee_cents` null and would otherwise silently stop
     * getting its digest.
     *
     * A carnet is judged spendable today, as the roster's chip judges it —
     * a backfill for a past month still reads today's carnets.
     *
     * @return Collection<int, Athlete>
     */
    public static function owing(Academy $academy, int $year, int $month, CarbonInterface $today): Collection
    {
        if (! Academy::query()->whereKey($academy->id)->chargingAFee()->exists()) {
            return new Collection();
        }

        return Athlete::query()
            ->where('academy_id', $academy->id)
            ->owing($year, $month, $today)
            ->orderBy('last_name_sort', 'asc')
            ->orderBy('first_name_sort', 'asc')
            ->orderBy('id')
            ->get();
    }

    /**
     * The last scheduled sessions before today, newest first. Null when there
     * are fewer of them (not configured, or too new) or when they are too long
     * ago to be news (paused).
     *
     * Before today, never today: the reminder goes out from 09:30 and the
     * day's own session has not happened yet (Copilot review on #735). Each
     * day is read against the schedule in force on it (#1764), so a timetable
     * change last week does not rewrite which sessions those were.
     *
     * @return list<string>|null
     */
    public static function streakDates(Academy $academy, CarbonInterface $today): ?array
    {
        $dates = ScheduledDays::lastBefore($academy, $today->toImmutable(), self::STREAK_LENGTH);
        if (\count($dates) < self::STREAK_LENGTH) {
            return null;
        }
        if ($dates[self::STREAK_LENGTH - 1] < $today->copy()->subDays(self::STREAK_REACH_DAYS)->toDateString()) {
            return null;
        }

        return $dates;
    }

    /**
     * The active athletes who missed every one of the streak's sessions.
     *
     * NOT filtered on `user_id`. The alert goes to the OWNER and reads
     * `attendance_records`, which the owner writes at check-in: an athlete's
     * linked account is on neither end of it. The filter was there from #735
     * and made the reminder fire for NOBODY on the desktop, where
     * `athlete_accounts` is off and no athlete has a `user_id` at all.
     *
     * The owner's own row is left out (#1913): the owner missing their own
     * classes is not a churn signal, and the alert about it went to the owner.
     *
     * @param  list<string>  $streakDates  From `streakDates()`, newest first.
     * @return Collection<int, Athlete>
     */
    public static function missedTheStreak(Academy $academy, array $streakDates): Collection
    {
        return $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->where('is_self', false)
            ->get()
            ->filter(static fn (Athlete $athlete): bool => self::missedAll($athlete, $streakDates))
            ->values();
    }

    /**
     * The active athletes whose birthday is on `$day` (#2047): the window
     * Today's list reads (`BirthdayWindow`), one day of it, so someone born on
     * 29 February has theirs on the 28th in a common year. The owner's own
     * row is left out: nobody needs reminding of their own birthday.
     *
     * @return Collection<int, Athlete>
     */
    public static function birthdays(Academy $academy, CarbonImmutable $day): Collection
    {
        return Athlete::query()
            ->where('academy_id', $academy->id)
            ->where('status', AthleteStatus::Active)
            ->where('is_self', false)
            ->birthdayOnAnyOf(BirthdayWindow::monthDays('today', $day) ?? [])
            ->orderBy('last_name_sort', 'asc')
            ->orderBy('first_name_sort', 'asc')
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  list<string>  $streakDates
     */
    private static function missedAll(Athlete $athlete, array $streakDates): bool
    {
        // Guard: an athlete who joined AFTER the earliest streak date
        // wasn't even rostered when those sessions happened — counting
        // them as "missed" is a false positive. The earliest streak
        // date is the LAST element (`ScheduledDays::lastBefore()` returns
        // newest first).
        $oldestStreakDate = end($streakDates) ?: null;
        if ($oldestStreakDate !== null
            && $athlete->joined_at->toDateString() > $oldestStreakDate
        ) {
            return false;
        }

        $present = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereIn('attended_on', $streakDates)
            ->count();

        return $present === 0;
    }
}
