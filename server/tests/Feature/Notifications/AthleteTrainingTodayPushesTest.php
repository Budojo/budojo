<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Notifications\AthleteTrainingTodayNotification;
use App\Support\NotificationCategory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;

/**
 * "Today is training day" push reminder (#729 A2). Five contracts:
 *
 *   1. Athletes in an academy that trains today, NOT yet marked
 *      present, receive the push.
 *   2. Athletes already marked present today are skipped.
 *   3. Academies that do NOT train today (today's dayOfWeek not in
 *      `training_days`) are skipped wholesale.
 *   4. Athletes who opted out of `athlete_training_today` are
 *      skipped.
 *   5. The command exits 0 when no per-academy failures occurred —
 *      a no-recipient day still exits clean.
 */

beforeEach(function (): void {
    // Freeze the clock to a Wednesday so the test is deterministic
    // regardless of when it runs. Carbon's dayOfWeek convention is
    // 0=Sun..6=Sat — Wednesday = 3.
    Carbon::setTestNow(Carbon::create(2026, 5, 13, 7, 0, 0));
    Notification::fake();
});

afterEach(function (): void {
    Carbon::setTestNow();
});

it('pushes to every linked athlete on a training day who is not yet present', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    $academy->forceFill(['training_days' => [3]])->save(); // Wed only.

    $athleteUser = User::factory()->create(['role' => 'athlete']);
    /** @var Athlete $a */
    $a = Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]);

    Artisan::call('budojo:send-athlete-training-today-pushes');

    Notification::assertSentTo($athleteUser, AthleteTrainingTodayNotification::class);
});

it('skips athletes already marked present today', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    $academy->forceFill(['training_days' => [3]])->save();

    $athleteUser = User::factory()->create(['role' => 'athlete']);
    /** @var Athlete $a */
    $a = Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]);
    AttendanceRecord::factory()->for($a)->create(['attended_on' => Carbon::today()]);

    Artisan::call('budojo:send-athlete-training-today-pushes');

    Notification::assertNotSentTo($athleteUser, AthleteTrainingTodayNotification::class);
});

it('skips academies that do not train today', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    // Mon + Fri only — today (Wed) is not in the list.
    $academy->forceFill(['training_days' => [1, 5]])->save();

    $athleteUser = User::factory()->create(['role' => 'athlete']);
    Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]);

    Artisan::call('budojo:send-athlete-training-today-pushes');

    Notification::assertNotSentTo($athleteUser, AthleteTrainingTodayNotification::class);
});

it('skips athletes who opted out of athlete_training_today', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    $academy->forceFill(['training_days' => [3]])->save();

    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athleteUser->forceFill([
        'notification_preferences' => [NotificationCategory::ATHLETE_TRAINING_TODAY => false],
    ])->save();
    Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]);

    Artisan::call('budojo:send-athlete-training-today-pushes');

    Notification::assertNotSentTo($athleteUser, AthleteTrainingTodayNotification::class);
});

it('skips invitation-pending athletes (athletes.user_id is null)', function (): void {
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    $academy->forceFill(['training_days' => [3]])->save();

    Athlete::factory()->for($academy)->create(['user_id' => null]);

    $exitCode = Artisan::call('budojo:send-athlete-training-today-pushes');

    expect($exitCode)->toBe(0);
});
