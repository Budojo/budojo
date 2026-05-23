<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

use App\Enums\AchievementKind;
use App\Models\Achievement;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Walks an athlete's state and unlocks any achievements they newly
 * qualify for (#961). Idempotent: re-running on the same athlete is
 * a no-op when no new threshold was crossed.
 *
 * Called from:
 *  - `AttendanceObserver::created()` — event-driven rules (first
 *    class, 100 sessions, 30-day streak).
 *  - `AthleteObserver::handleBeltChange()` — belt promotion link.
 *  - `budojo:evaluate-time-based-achievements` nightly cron —
 *    time-based rules (anniversary).
 *
 * Returns the list of newly-unlocked rows so callers can emit
 * `achievement_unlocked` community posts + push notifications.
 */
class EvaluateAchievementsAction
{
    /**
     * @return Collection<int, Achievement>
     */
    public function execute(Athlete $athlete): Collection
    {
        $newlyUnlocked = collect();

        foreach (AchievementKind::cases() as $kind) {
            if ($this->alreadyUnlocked($athlete, $kind)) {
                continue;
            }
            $metadata = $this->checkKind($athlete, $kind);
            if ($metadata === null) {
                continue;
            }
            /** @var Achievement $achievement */
            $achievement = Achievement::create([
                'athlete_id' => $athlete->id,
                'kind' => $kind,
                'unlocked_at' => CarbonImmutable::now(),
                'metadata' => $metadata,
            ]);
            $newlyUnlocked->push($achievement);
        }

        return $newlyUnlocked;
    }

    private function alreadyUnlocked(Athlete $athlete, AchievementKind $kind): bool
    {
        return Achievement::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', $kind->value)
            ->exists();
    }

    /**
     * Returns the metadata payload to store when the kind unlocks for
     * the athlete RIGHT NOW; returns null when the threshold hasn't
     * been crossed. Each branch is small + isolated so a future
     * tuning lands without touching the others.
     *
     * @return array<string, mixed>|null
     */
    private function checkKind(Athlete $athlete, AchievementKind $kind): ?array
    {
        return match ($kind) {
            AchievementKind::FirstClass => $this->checkFirstClass($athlete),
            AchievementKind::ThirtyDayStreak => $this->checkThirtyDayStreak($athlete),
            AchievementKind::HundredSessions => $this->checkHundredSessions($athlete),
            AchievementKind::OneYearAtAcademy => $this->checkOneYearAtAcademy($athlete),
            AchievementKind::BeltPromotion => $this->checkBeltPromotion($athlete),
        };
    }

    /**
     * @return array<string, mixed>|null
     */
    private function checkFirstClass(Athlete $athlete): ?array
    {
        $count = AttendanceRecord::query()->where('athlete_id', $athlete->id)->count();

        return $count >= 1 ? ['count' => $count] : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function checkHundredSessions(Athlete $athlete): ?array
    {
        $count = AttendanceRecord::query()->where('athlete_id', $athlete->id)->count();

        return $count >= 100 ? ['count' => $count] : null;
    }

    /**
     * 30 consecutive calendar days with ≥1 attendance row. Walks
     * backwards from today; a single gap day breaks the streak. The
     * check runs in PHP (small N) — building a window query on every
     * insert would be heavier.
     *
     * @return array<string, mixed>|null
     */
    private function checkThirtyDayStreak(Athlete $athlete): ?array
    {
        $today = CarbonImmutable::today();
        $thirtyDaysAgo = $today->subDays(29);

        $days = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', '>=', $thirtyDaysAgo->toDateString())
            ->whereDate('attended_on', '<=', $today->toDateString())
            ->pluck('attended_on')
            ->map(function (mixed $d): string {
                if ($d instanceof \Carbon\CarbonInterface) {
                    return $d->toDateString();
                }

                // attendance_records.attended_on is cast to date on the
                // model — this branch is the unhydrated-row edge.
                return \is_string($d) ? $d : '';
            })
            ->unique()
            ->values();

        if ($days->count() < 30) {
            return null;
        }

        // Streak check — every one of the 30 calendar days back from
        // today must be in the set.
        $cursor = $today;
        for ($i = 0; $i < 30; $i++) {
            if (! $days->contains($cursor->toDateString())) {
                return null;
            }
            $cursor = $cursor->subDay();
        }

        return ['days' => 30, 'ending_on' => $today->toDateString()];
    }

    /**
     * Anniversary — athletes.joined_at + N years lands EXACTLY today.
     * The kind unlocks on the first anniversary crossing and never
     * fires again (UNIQUE constraint per athlete + kind).
     *
     * @return array<string, mixed>|null
     */
    private function checkOneYearAtAcademy(Athlete $athlete): ?array
    {
        $today = CarbonImmutable::today();
        // joined_at is `not null` at the schema level (see athletes
        // migration) — guaranteed Carbon instance.
        $joinedAt = $athlete->joined_at;
        $years = (int) $joinedAt->diffInYears($today);
        if ($years < 1) {
            return null;
        }
        // Anniversary day check — only unlock on the day, not any time
        // in the year after. This is gentler: the badge surfaces on
        // exactly the right day.
        $anniversaryThisYear = $joinedAt->copy()->setYear($today->year);
        if (! $today->isSameDay($anniversaryThisYear)) {
            return null;
        }

        return ['years' => $years];
    }

    /**
     * Links the existing belt_promotion event to the badge surface.
     * Unlocks the first time the athlete is promoted past their
     * initial belt (i.e. the first `belt_promotion` row in
     * `athlete_promotions` of kind `belt`).
     *
     * @return array<string, mixed>|null
     */
    private function checkBeltPromotion(Athlete $athlete): ?array
    {
        $firstPromotion = \App\Models\AthletePromotion::query()
            ->where('athlete_id', $athlete->id)
            ->where('kind', 'belt')
            ->orderBy('recorded_at')
            ->first();
        if ($firstPromotion === null) {
            return null;
        }

        return [
            'to_belt' => $firstPromotion->to_belt,
            'from_belt' => $firstPromotion->from_belt,
        ];
    }
}
