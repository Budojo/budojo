<?php

declare(strict_types=1);

use App\Console\Schedules\DesktopSchedule;
use App\Console\Schedules\ScheduleDefinition;
use App\Console\Schedules\WebSchedule;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;

/**
 * The two schedule definitions (#1226). A hosted server runs cron every
 * minute of every day; a desktop app is closed most of the day, so a
 * `dailyAt('09:00')` job is simply missed whenever 09:00 falls in the gap.
 *
 * DesktopSchedule replaces wall-clock anchors with a tight cadence inside a
 * time window and leans on the fact that every reminder is idempotent per
 * day/week via notification_log: the first tick after the window opens with
 * the app running fires it once.
 *
 * Each definition is registered into a fresh Schedule and inspected directly
 * — no environment juggling, no application reboot. Laravel resolves a
 * between() window when the event is registered, so where a test cares about
 * the clock it freezes it before calling register().
 */

/** @return array<string, Event> keyed by the artisan command name */
function eventsOf(ScheduleDefinition $definition): array
{
    $schedule = new Schedule();
    $definition->register($schedule);

    $events = [];

    foreach ($schedule->events() as $event) {
        if (preg_match('/artisan[\'"]? (budojo:[a-z-]+)/', $event->command ?? '', $m) === 1) {
            $events[$m[1]] = $event;
        }
    }

    return $events;
}

afterEach(fn () => Carbon::setTestNow());

it('is what routes/console.php registered for the web profile', function (): void {
    // The suite boots as web: the application's live schedule must be the
    // WebSchedule definition, command for command.
    $live = array_keys(eventsOf(new WebSchedule()));
    $registered = [];

    foreach (app(Schedule::class)->events() as $event) {
        if (preg_match('/artisan[\'"]? (budojo:[a-z-]+)/', $event->command ?? '', $m) === 1) {
            $registered[] = $m[1];
        }
    }

    expect($registered)->toEqualCanonicalizing($live);
});

it('keeps the wall-clock schedule on the web profile', function (): void {
    $events = eventsOf(new WebSchedule());

    expect($events['budojo:send-medical-cert-expiry-reminders']->expression)->toBe('0 9 * * *')
        ->and($events['budojo:send-unpaid-athletes-digest']->expression)->toBe('0 9 16 * *')
        ->and($events)->toHaveKey('budojo:send-athlete-training-today-pushes')
        ->and($events)->toHaveKey('budojo:send-weekly-recap-pushes')
        ->and($events)->toHaveKey('budojo:send-athlete-payment-overdue-pushes')
        ->and($events)->toHaveCount(11);
});

it('runs the owner reminders on a tight cadence inside their window on the desktop', function (): void {
    $events = eventsOf(new DesktopSchedule());

    // Every five minutes from 09:00: the first tick with the app open sends
    // the day's digest; notification_log makes every later tick a no-op.
    expect($events['budojo:send-medical-cert-expiry-reminders']->expression)->toBe('*/5 * * * *')
        ->and($events['budojo:send-medical-cert-expiry-reminders']->timezone)->toBe('Europe/Rome')
        ->and($events['budojo:send-athlete-missed-streak-pushes']->expression)->toBe('*/5 * * * *');
});

it('does not fire the owner reminders before their window on the desktop', function (): void {
    // The between() filter is what stops a 00:01 toast for someone working
    // late; the expression alone would fire all night. Laravel resolves the
    // window at registration, so the clock is frozen before each register().
    Carbon::setTestNow(Carbon::parse('2026-08-15 08:55:00', 'Europe/Rome'));
    expect(eventsOf(new DesktopSchedule())['budojo:send-medical-cert-expiry-reminders']->filtersPass(app()))->toBeFalse();

    Carbon::setTestNow(Carbon::parse('2026-08-15 09:05:00', 'Europe/Rome'));
    expect(eventsOf(new DesktopSchedule())['budojo:send-medical-cert-expiry-reminders']->filtersPass(app()))->toBeTrue();
});

it('resolves the window in Rome time, not UTC', function (): void {
    // 09:05 Rome in August is 07:05 UTC. Had timezone() come after between()
    // the window would have been UTC-anchored and this would be false.
    Carbon::setTestNow(Carbon::parse('2026-08-15 07:05:00', 'UTC'));

    expect(eventsOf(new DesktopSchedule())['budojo:send-medical-cert-expiry-reminders']->filtersPass(app()))->toBeTrue();
});

it('runs the monthly digest only on its day, at the tight cadence, on the desktop', function (): void {
    Carbon::setTestNow(Carbon::parse('2026-08-15 10:00:00', 'Europe/Rome'));
    $digest = eventsOf(new DesktopSchedule())['budojo:send-unpaid-athletes-digest'];
    expect($digest->expression)->toBe('*/5 * * * *')
        ->and($digest->filtersPass(app()))->toBeFalse();

    Carbon::setTestNow(Carbon::parse('2026-08-16 10:00:00', 'Europe/Rome'));
    expect(eventsOf(new DesktopSchedule())['budojo:send-unpaid-athletes-digest']->filtersPass(app()))->toBeTrue();
});

it('runs housekeeping every half hour on the desktop', function (): void {
    $events = eventsOf(new DesktopSchedule());

    foreach ([
        'budojo:purge-expired-pending-deletions',
        'budojo:purge-expired-email-changes',
        'budojo:purge-expired-login-attempts',
        'budojo:purge-expired-medical-certificates',
        'budojo:evaluate-time-based-achievements',
    ] as $command) {
        expect($events)->toHaveKey($command)
            ->and($events[$command]->expression)->toBe('*/30 * * * *');
    }
});

it('does not schedule the athlete-facing pushes on the desktop', function (): void {
    // They need athlete accounts and a push transport; the profile has neither.
    $events = eventsOf(new DesktopSchedule());

    expect($events)->not->toHaveKey('budojo:send-athlete-training-today-pushes')
        ->and($events)->not->toHaveKey('budojo:send-weekly-recap-pushes')
        ->and($events)->not->toHaveKey('budojo:send-athlete-payment-overdue-pushes')
        ->and($events)->toHaveCount(8);
});
