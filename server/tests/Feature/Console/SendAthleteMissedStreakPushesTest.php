<?php

declare(strict_types=1);

use App\Console\Commands\SendAthleteMissedStreakPushes;
use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Notifications\OwnerAthleteMissedStreakNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;

/*
 * The only churn signal in the product, and it had no behavioural test —
 * which is how it came to fire for nobody on the shipping desktop build for
 * the whole of its life. `whereNotNull('user_id')` restricted the athletes it
 * would even consider, and with `athlete_accounts` off no athlete has one.
 *
 * The alert goes to the OWNER and reads `attendance_records`, which the owner
 * writes at check-in: an athlete's linked account is on neither end of it.
 */

beforeEach(function (): void {
    Notification::fake();
    // A Wednesday. The academy trains Mon/Wed/Fri, and today does not count
    // (the evening's session has not happened), so the last three training
    // days are Mon 14th, Fri 11th and Wed 9th.
    Carbon::setTestNow('2026-09-16 20:00:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/**
 * Mon/Wed/Fri since January, as a schedule row: the days come from the
 * schedule history (#1764), the way `CreateAcademyAction` writes it.
 *
 * @param  list<int>  $days
 */
function academyTrainingMonWedFri(array $days = [1, 3, 5]): Academy
{
    $user = User::factory()->create();
    $academy = Academy::factory()->for($user, 'owner')->create(['training_days' => $days]);
    $academy->schedules()->create(['training_days' => $days, 'effective_from' => '2026-01-01']);

    return $academy;
}

function athleteJoinedLongAgo(Academy $academy, AthleteStatus $status = AthleteStatus::Active): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $academy->id,
        'status' => $status,
        'joined_at' => '2026-01-01',
        // Deliberately NO user_id: this is the shipping desktop shape, where
        // `athlete_accounts` is off and nobody has a linked account.
        'user_id' => null,
    ]);
}

it('warns the owner about an athlete with no linked account', function (): void {
    $academy = academyTrainingMonWedFri();
    $athlete = athleteJoinedLongAgo($academy);

    // No attendance on any of the last three training days.
    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertSentTo(
        $academy->owner,
        OwnerAthleteMissedStreakNotification::class,
    );
    expect($athlete->user_id)->toBeNull();
});

it('says nothing about an athlete who came to one of the three', function (): void {
    $academy = academyTrainingMonWedFri();
    $athlete = athleteJoinedLongAgo($academy);

    AttendanceRecord::factory()->create([
        'athlete_id' => $athlete->id,
        'attended_on' => '2026-09-14',
    ]);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('says nothing about an inactive athlete', function (): void {
    $academy = academyTrainingMonWedFri();
    athleteJoinedLongAgo($academy, AthleteStatus::Inactive);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('says nothing about someone who joined after the streak began', function (): void {
    $academy = academyTrainingMonWedFri();
    Athlete::factory()->create([
        'academy_id' => $academy->id,
        'status' => AthleteStatus::Active,
        // After Wednesday the 9th, the oldest day in the window: they were
        // not on the roster when those sessions happened.
        'joined_at' => '2026-09-15',
        'user_id' => null,
    ]);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('walks the schedule in force on each day, not today\'s', function (): void {
    // Tue/Thu from Tuesday 15th. The last three training days are then Tue
    // 15th (new schedule), Mon 14th and Fri 11th (old). Today's snapshot
    // alone would say Tue 15th, Thu 10th and Tue 8th; the old schedule alone,
    // Mon 14th, Fri 11th and Wed 9th. The athlete came on the 10th and the
    // 9th, so only the right streak finds three misses.
    $academy = academyTrainingMonWedFri();
    $academy->schedules()->create(['training_days' => [2, 4], 'effective_from' => '2026-09-15']);
    $academy->update(['training_days' => [2, 4]]);
    $athlete = athleteJoinedLongAgo($academy);
    AttendanceRecord::factory()->create(['athlete_id' => $athlete->id, 'attended_on' => '2026-09-10']);
    AttendanceRecord::factory()->create(['athlete_id' => $athlete->id, 'attended_on' => '2026-09-09']);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertSentTo($academy->owner, OwnerAthleteMissedStreakNotification::class);
});

it('says nothing for an academy whose schedule was never configured', function (): void {
    $academy = academyTrainingMonWedFri([]);
    athleteJoinedLongAgo($academy);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('says nothing while the schedule is paused, about the sessions before the pause', function (): void {
    // Mon/Wed/Fri until August, then not configured. The last three scheduled
    // days are at the end of July: missing them says nothing about now.
    $academy = academyTrainingMonWedFri();
    $academy->schedules()->create(['training_days' => null, 'effective_from' => '2026-08-01']);
    $academy->update(['training_days' => null]);
    athleteJoinedLongAgo($academy);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('reaches three weeks back for an academy that trains once a week', function (): void {
    // Wednesdays only: the streak is 9th, 2nd and 26 August, 21 days back.
    $academy = academyTrainingMonWedFri([3]);
    athleteJoinedLongAgo($academy);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertSentTo($academy->owner, OwnerAthleteMissedStreakNotification::class);
});

/** An earlier alert about this athlete, as the inbox holds it. */
function earlierStreakAlert(Academy $academy, Athlete $athlete, string $at): void
{
    $academy->owner->notifications()->create([
        'id' => (string) Illuminate\Support\Str::uuid(),
        'type' => OwnerAthleteMissedStreakNotification::class,
        'data' => ['kind' => 'owner_athlete_missed_streak', 'athlete_id' => $athlete->id],
        'created_at' => $at,
    ]);
}

it('does not warn twice about the same three sessions, however long the pause', function (): void {
    // Paused from 1 September: the last sessions are 31, 28 and 26 August,
    // and the owner was told on the 1st. The fortnight has passed, but
    // nothing new has been missed since.
    $academy = academyTrainingMonWedFri();
    $academy->schedules()->create(['training_days' => null, 'effective_from' => '2026-09-01']);
    $athlete = athleteJoinedLongAgo($academy);
    earlierStreakAlert($academy, $athlete, '2026-09-01 09:30:00');

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('does not warn again within the fortnight, even about a streak that moved on', function (): void {
    // Told on the 12th; the streak has since moved to 14, 11 and 9 September.
    $academy = academyTrainingMonWedFri();
    $athlete = athleteJoinedLongAgo($academy);
    earlierStreakAlert($academy, $athlete, '2026-09-12 09:30:00');

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});

it('warns again once the fortnight has passed and new sessions were missed', function (): void {
    $academy = academyTrainingMonWedFri();
    $athlete = athleteJoinedLongAgo($academy);
    earlierStreakAlert($academy, $athlete, '2026-08-31 09:30:00');

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertSentTo($academy->owner, OwnerAthleteMissedStreakNotification::class);
});
