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
    // A Wednesday. The academy trains Mon/Wed/Fri, so the last three training
    // days are Wed 16th, Mon 14th and Fri 11th.
    Carbon::setTestNow('2026-09-16 20:00:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function academyTrainingMonWedFri(): Academy
{
    $user = User::factory()->create();

    return Academy::factory()->for($user, 'owner')->create([
        'training_days' => [1, 3, 5],
    ]);
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
        // After Friday the 11th, the oldest day in the window: they were not
        // on the roster when those sessions happened.
        'joined_at' => '2026-09-15',
        'user_id' => null,
    ]);

    $this->artisan(SendAthleteMissedStreakPushes::class)->assertSuccessful();

    Notification::assertNothingSent();
});
