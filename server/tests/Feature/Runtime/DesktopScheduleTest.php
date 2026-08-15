<?php

declare(strict_types=1);

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;

/**
 * The scheduler on the desktop profile (#1226). A hosted server runs cron
 * every minute of every day; a desktop app is closed most of the day, so a
 * `dailyAt('09:00')` job is simply missed whenever 09:00 falls in the gap.
 *
 * The desktop schedule (routes/console-desktop.php) replaces wall-clock
 * anchors with a tight cadence inside a time window and leans on the fact
 * that every reminder is idempotent per day/week via notification_log: the
 * first tick after the window opens with the app running fires it once.
 *
 * routes/console.php is evaluated at boot, so the profile has to be set in
 * the environment before the application is created — hence refresh.
 */

/** @return array<string, Event> keyed by the artisan command name */
function scheduledEvents(): array
{
    $events = [];

    foreach (app(Schedule::class)->events() as $event) {
        if (preg_match('/artisan[\'"]? (budojo:[a-z-]+)/', $event->command ?? '', $m) === 1) {
            $events[$m[1]] = $event;
        }
    }

    return $events;
}

function bootWithRuntime(\Tests\TestCase $test, string $profile): void
{
    // The desktop profile refuses to boot on the test suite's array drivers
    // (DesktopDriverGuard, #1220) — the same env the Electron shell injects.
    $vars = $profile === 'desktop'
        ? ['BUDOJO_RUNTIME' => 'desktop', 'CACHE_STORE' => 'file', 'SESSION_DRIVER' => 'file', 'QUEUE_CONNECTION' => 'sync']
        : ['BUDOJO_RUNTIME' => 'web'];

    foreach ($vars as $key => $value) {
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }

    // refreshApplication() is protected on the framework TestCase; a closure
    // called in the test's scope reaches it without subclassing anything.
    (function (): void {
        /** @var \Tests\TestCase $this */
        $this->refreshApplication();
    })->call($test);
}

afterEach(function (): void {
    // Back to phpunit.xml's values: array drivers, web profile.
    foreach (['BUDOJO_RUNTIME' => null, 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'] as $key => $value) {
        unset($_SERVER[$key]);
        if ($value === null) {
            putenv($key);
            unset($_ENV[$key]);
        } else {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
    (function (): void {
        /** @var TestsTestCase $this */
        $this->refreshApplication();
    })->call($this);
});

it('keeps the wall-clock schedule on the web profile', function (): void {
    bootWithRuntime($this, 'web');
    $events = scheduledEvents();

    expect($events['budojo:send-medical-cert-expiry-reminders']->expression)->toBe('0 9 * * *')
        ->and($events['budojo:send-unpaid-athletes-digest']->expression)->toBe('0 9 16 * *')
        ->and($events)->toHaveKey('budojo:send-athlete-training-today-pushes')
        ->and($events)->toHaveKey('budojo:send-weekly-recap-pushes')
        ->and($events)->toHaveKey('budojo:send-athlete-payment-overdue-pushes');
});

it('runs the owner reminders on a tight cadence inside their window on the desktop', function (): void {
    bootWithRuntime($this, 'desktop');
    $events = scheduledEvents();

    // Every five minutes from 09:00: the first tick with the app open sends
    // the day's digest; notification_log makes every later tick a no-op.
    expect($events['budojo:send-medical-cert-expiry-reminders']->expression)->toBe('*/5 * * * *')
        ->and($events['budojo:send-medical-cert-expiry-reminders']->timezone)->toBe('Europe/Rome')
        ->and($events['budojo:send-athlete-missed-streak-pushes']->expression)->toBe('*/5 * * * *');
});

it('does not fire the owner reminders before their window on the desktop', function (): void {
    // The between() filter is what stops a 00:01 toast for someone working
    // late; the expression alone would fire all night. Laravel resolves the
    // window when the schedule is registered, so the clock is frozen BEFORE
    // each boot — which is also why timezone() precedes between() in the file.
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-08-15 08:55:00', 'Europe/Rome'));
    bootWithRuntime($this, 'desktop');
    expect(scheduledEvents()['budojo:send-medical-cert-expiry-reminders']->filtersPass(app()))->toBeFalse();

    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-08-15 09:05:00', 'Europe/Rome'));
    bootWithRuntime($this, 'desktop');
    expect(scheduledEvents()['budojo:send-medical-cert-expiry-reminders']->filtersPass(app()))->toBeTrue();

    \Illuminate\Support\Carbon::setTestNow();
});

it('runs the monthly digest only on its day, at the tight cadence, on the desktop', function (): void {
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-08-15 10:00:00', 'Europe/Rome'));
    bootWithRuntime($this, 'desktop');
    $digest = scheduledEvents()['budojo:send-unpaid-athletes-digest'];
    expect($digest->expression)->toBe('*/5 * * * *')
        ->and($digest->filtersPass(app()))->toBeFalse();

    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-08-16 10:00:00', 'Europe/Rome'));
    bootWithRuntime($this, 'desktop');
    expect(scheduledEvents()['budojo:send-unpaid-athletes-digest']->filtersPass(app()))->toBeTrue();

    \Illuminate\Support\Carbon::setTestNow();
});

it('runs housekeeping every half hour on the desktop', function (): void {
    bootWithRuntime($this, 'desktop');
    $events = scheduledEvents();

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
    bootWithRuntime($this, 'desktop');
    $events = scheduledEvents();

    expect($events)->not->toHaveKey('budojo:send-athlete-training-today-pushes')
        ->and($events)->not->toHaveKey('budojo:send-weekly-recap-pushes')
        ->and($events)->not->toHaveKey('budojo:send-athlete-payment-overdue-pushes');
});
