<?php

declare(strict_types=1);

namespace App\Actions\Notification;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Notifications\OwnerAcademyDocumentExpiringNotification;
use App\Notifications\OwnerAthleteMissedStreakNotification;
use App\Notifications\OwnerMedicalCertExpiringDigestNotification;
use App\Notifications\OwnerUnpaidAthletesDigestNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\NotificationText;
use App\Support\OperatorDay;
use App\Support\ReminderSubjects;
use App\Support\UpcomingReminder;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * The owner's reminders of the next fourteen days (#2047, PRD § 6.3), for the
 * phone to schedule with Android. Nothing runs on a phone with the app
 * closed, so the reminders the PC sends on the day (#1226) are worked out
 * ahead: the same selections (`ReminderSubjects`), the same opt-outs, the same
 * sentences (`NotificationText`), each at the hour the PC's window opens.
 *
 * A reminder of today stays listed after its hour, so a phone opened late
 * still shows one it never scheduled. Anything that changes after the
 * forecast (a fee paid on the PC) is put right by the next one, which the
 * phone asks for at every opening and sync.
 *
 * The missed streak is the one reminder that cannot be told ahead: it holds
 * once sessions have passed without the athlete, and only a check-in says
 * whether they did. So it is today's, keyed by the athlete's last session:
 * one reminder for each absence, where the PC tells again every fortnight.
 */
final class ForecastOwnerRemindersAction
{
    public const int DAYS = 14;

    /** @return list<UpcomingReminder> */
    public function execute(User $owner, Academy $academy): array
    {
        $today = OperatorDay::today();
        $days = array_map(static fn (int $ahead): CarbonImmutable => $today->addDays($ahead), range(0, self::DAYS - 1));

        $reminders = [
            ...$this->ifEnabled($owner, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS, fn (): array => $this->medicalCertificates($owner, $academy, $days)),
            ...$this->ifEnabled($owner, NotificationCategory::ACADEMY_DOCUMENT_EXPIRY_REMINDERS, fn (): array => $this->academyDocuments($owner, $academy, $days)),
            ...$this->ifEnabled($owner, NotificationCategory::UNPAID_ATHLETES_DIGEST, fn (): array => $this->unpaid($owner, $academy, $days, $today)),
            ...$this->ifEnabled($owner, NotificationCategory::OWNER_ATHLETE_MISSED_STREAK, fn (): array => $this->missedStreaks($owner, $academy, $today)),
            ...$this->birthdays($owner, $academy, $days),
        ];
        usort($reminders, static fn (UpcomingReminder $a, UpcomingReminder $b): int => [$a->at, $a->key] <=> [$b->at, $b->key]);

        return $reminders;
    }

    /**
     * @param  callable(): list<UpcomingReminder>  $reminders
     * @return list<UpcomingReminder>
     */
    private function ifEnabled(User $owner, string $category, callable $reminders): array
    {
        return NotificationPreferences::isEnabled($owner, $category) ? $reminders() : [];
    }

    /**
     * @param  list<CarbonImmutable>  $days
     * @return list<UpcomingReminder>
     */
    private function medicalCertificates(User $owner, Academy $academy, array $days): array
    {
        $reminders = [];
        foreach ($days as $day) {
            $documents = ReminderSubjects::medicalCertificates($academy, ReminderSubjects::expiryDates($day));
            if ($documents->isNotEmpty()) {
                $reminders[] = $this->remind(
                    $owner,
                    'medical-certificates:' . $day->toDateString(),
                    self::at($day, '09:00'),
                    new OwnerMedicalCertExpiringDigestNotification($academy, $documents)->toDatabase($owner),
                );
            }
        }

        return $reminders;
    }

    /**
     * @param  list<CarbonImmutable>  $days
     * @return list<UpcomingReminder>
     */
    private function academyDocuments(User $owner, Academy $academy, array $days): array
    {
        $reminders = [];
        foreach ($days as $day) {
            $documents = ReminderSubjects::academyDocuments($academy, ReminderSubjects::expiryDates($day));
            if ($documents->isNotEmpty()) {
                $reminders[] = $this->remind(
                    $owner,
                    'academy-documents:' . $day->toDateString(),
                    self::at($day, '09:00'),
                    new OwnerAcademyDocumentExpiringNotification($academy, $documents)->toDatabase($owner),
                );
            }
        }

        return $reminders;
    }

    /**
     * On the 16th, as on the PC: before it, not having paid yet is normal.
     *
     * @param  list<CarbonImmutable>  $days
     * @return list<UpcomingReminder>
     */
    private function unpaid(User $owner, Academy $academy, array $days, CarbonImmutable $today): array
    {
        $reminders = [];
        foreach ($days as $day) {
            if ($day->day !== 16) {
                continue;
            }
            $athletes = ReminderSubjects::owing($academy, $day->year, $day->month, $today);
            if ($athletes->isNotEmpty()) {
                $reminders[] = $this->remind(
                    $owner,
                    'unpaid:' . $day->format('Y-m'),
                    self::at($day, '09:00'),
                    new OwnerUnpaidAthletesDigestNotification($academy, $athletes, $day->year, $day->month)->toDatabase($owner),
                );
            }
        }

        return $reminders;
    }

    /** @return list<UpcomingReminder> */
    private function missedStreaks(User $owner, Academy $academy, CarbonImmutable $today): array
    {
        $streakDates = ReminderSubjects::streakDates($academy, $today);
        if ($streakDates === null) {
            return [];
        }

        $reminders = [];
        foreach (ReminderSubjects::missedTheStreak($academy, $streakDates) as $athlete) {
            $reminders[] = $this->remind(
                $owner,
                \sprintf('missed-streak:%d:%s', $athlete->id, $this->lastSession($athlete)),
                self::at($today, '09:30'),
                new OwnerAthleteMissedStreakNotification($athlete, ReminderSubjects::STREAK_LENGTH)->toDatabase($owner),
            );
        }

        return $reminders;
    }

    /** The day the absence began: the athlete's last session, or the day they joined. */
    private function lastSession(Athlete $athlete): string
    {
        $last = AttendanceRecord::query()->where('athlete_id', $athlete->id)->max('attended_on');

        return \is_string($last) ? substr($last, 0, 10) : $athlete->joined_at->toDateString();
    }

    /**
     * New with the phone (#2047): the PC has no birthday reminder, only
     * Today's list. No opt-out yet, so none to read.
     *
     * @param  list<CarbonImmutable>  $days
     * @return list<UpcomingReminder>
     */
    private function birthdays(User $owner, Academy $academy, array $days): array
    {
        $reminders = [];
        foreach ($days as $day) {
            $athletes = ReminderSubjects::birthdays($academy, $day);
            if ($athletes->isNotEmpty()) {
                $reminders[] = $this->remind($owner, 'birthdays:' . $day->toDateString(), self::at($day, '09:00'), self::birthdayData($athletes));
            }
        }

        return $reminders;
    }

    /**
     * What `NotificationText` writes the birthday sentence from: the first
     * three names and how many more, as the digests carry theirs.
     *
     * @param  Collection<int, Athlete>  $athletes
     * @return array<string, mixed>
     */
    private static function birthdayData(Collection $athletes): array
    {
        $names = $athletes->map(static fn (Athlete $athlete): string => trim($athlete->first_name . ' ' . $athlete->last_name));

        return [
            'kind' => NotificationText::BIRTHDAYS,
            'link' => '/dashboard/athletes?birthday=today',
            'params' => [
                'count' => $names->count(),
                'names' => $names->take(3)->values()->all(),
                'more' => max(0, $names->count() - 3),
            ],
        ];
    }

    /** @param  array<array-key, mixed>  $data  A notification's `data`, as the bell stores it. */
    private function remind(User $owner, string $key, CarbonImmutable $at, array $data): UpcomingReminder
    {
        $text = NotificationText::of($data, $owner->locale->value ?? 'en');

        return new UpcomingReminder($key, $at, $text['title'], $text['body'], \is_string($data['link'] ?? null) ? $data['link'] : '');
    }

    /** The hour the PC's window opens on that day, on the operator's clock (#1963). */
    private static function at(CarbonImmutable $day, string $time): CarbonImmutable
    {
        return CarbonImmutable::parse($day->toDateString() . ' ' . $time, OperatorDay::timezone());
    }
}
