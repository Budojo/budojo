<?php

declare(strict_types=1);

use App\Actions\Auth\AcceptAthleteInvitationAction;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Notifications\AthleteSignedUpNotification;
use App\Support\NotificationCategory;
use Illuminate\Support\Facades\Notification;

/**
 * Owner-side notification fired when an athlete on the roster
 * completes signup via `AcceptAthleteInvitationAction` (#729 A1).
 * Three assertions matter:
 *
 *   1. The owner receives the notification on the golden path.
 *   2. The category gate suppresses delivery when the owner has
 *      explicitly opted out via `notification_preferences`.
 *   3. The just-signed-up athlete is NEVER the recipient (no
 *      self-ping).
 */

it('notifies the owner when an athlete completes signup', function (): void {
    Notification::fake();

    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create(['email' => 'mario@example.com']);

    $rawToken = \Illuminate\Support\Str::random(64);
    AthleteInvitation::factory()
        ->for($athlete)
        ->create(['token' => AthleteInvitation::hashToken($rawToken)]);

    app(AcceptAthleteInvitationAction::class)->execute($rawToken, 'CorrectHorse123!');

    Notification::assertSentTo($owner, AthleteSignedUpNotification::class);
});

it('does NOT notify the owner when they have opted out of athlete_signed_up', function (): void {
    Notification::fake();

    $owner = userWithAcademy();
    $owner->forceFill([
        'notification_preferences' => [NotificationCategory::ATHLETE_SIGNED_UP => false],
    ])->save();

    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create(['email' => 'mario@example.com']);
    $rawToken = \Illuminate\Support\Str::random(64);
    AthleteInvitation::factory()->for($athlete)->create(['token' => AthleteInvitation::hashToken($rawToken)]);

    app(AcceptAthleteInvitationAction::class)->execute($rawToken, 'CorrectHorse123!');

    Notification::assertNothingSentTo($owner);
});

it('never notifies the just-signed-up athlete (no self-ping)', function (): void {
    Notification::fake();

    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create(['email' => 'mario@example.com']);
    $rawToken = \Illuminate\Support\Str::random(64);
    AthleteInvitation::factory()->for($athlete)->create(['token' => AthleteInvitation::hashToken($rawToken)]);

    $result = app(AcceptAthleteInvitationAction::class)->execute($rawToken, 'CorrectHorse123!');

    Notification::assertNotSentTo($result['user'], AthleteSignedUpNotification::class);
});
