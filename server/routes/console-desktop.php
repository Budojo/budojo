<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Desktop schedule (#1226, M11 #1218)
|--------------------------------------------------------------------------
|
| Loaded from routes/console.php in place of the web schedule when the
| runtime profile is `desktop`. Same commands, different cadence — because a
| desktop app has no cron and is closed most of the day.
|
| The web schedule anchors jobs to wall-clock minutes (`dailyAt('09:00')`).
| On a server that fires exactly once, every day. On a laptop that is off at
| 09:00 it never fires: the tick that would have caught it never happened.
| A certificate-expiry reminder that is "simply missed" is the one failure
| in this product with consequences outside the software.
|
| The replacement leans on a property every reminder here already has: it
| is idempotent per day / week / 14 days via `notification_log`. So a tight
| cadence inside a time window is safe — the first tick after the window
| opens with the app running sends once, every later tick is a cheap no-op
| query — and turns "did 09:00 happen while we were up?" into "has this run
| since the window opened?", which is the question that actually matters.
|
| Cadences: five minutes for the reminders (worst-case latency after opening
| the app: five minutes; each no-op is one indexed query on one academy),
| thirty for housekeeping (cheap idempotent deletes; any half-hour session
| catches one). Wall-clock anchors survive only as the *earliest* time,
| via between(), so nobody gets a toast at 00:01 for working late.
|
| The three athlete-facing pushes are not scheduled at all: they need
| athlete accounts and a push transport, and the desktop profile has
| neither (App\Enums\Capability).
|
| Timezone stays Europe/Rome for parity with the web schedule.
|
*/

// ── Housekeeping ─────────────────────────────────────────────────────────────

Schedule::command('budojo:purge-expired-pending-deletions')
    ->everyThirtyMinutes()
    ->withoutOverlapping(60);

Schedule::command('budojo:purge-expired-email-changes')
    ->everyThirtyMinutes()
    ->withoutOverlapping(60);

Schedule::command('budojo:purge-expired-login-attempts')
    ->everyThirtyMinutes()
    ->withoutOverlapping(60);

Schedule::command('budojo:purge-expired-medical-certificates')
    ->everyThirtyMinutes()
    ->withoutOverlapping(60);

Schedule::command('budojo:evaluate-time-based-achievements')
    ->everyThirtyMinutes()
    ->withoutOverlapping(60);

// ── Owner reminders — the ones with consequences ─────────────────────────────

// timezone() BEFORE between(): between() resolves its window eagerly, with
// whatever timezone the event has at that moment — after it, the window is
// UTC and 09:00 Rome is 07:00, or 08:00, depending on the season.
Schedule::command('budojo:send-medical-cert-expiry-reminders')
    ->everyFiveMinutes()
    ->timezone('Europe/Rome')
    ->between('09:00', '23:59')
    ->withoutOverlapping(60);

Schedule::command('budojo:send-athlete-missed-streak-pushes')
    ->everyFiveMinutes()
    ->timezone('Europe/Rome')
    ->between('09:30', '23:59')
    ->withoutOverlapping(60);

// Monthly on the 16th, as on the web; the day gate replaces monthlyOn() so
// the digest still goes out if the app is opened at 15:00 that day.
Schedule::command('budojo:send-unpaid-athletes-digest')
    ->everyFiveMinutes()
    ->timezone('Europe/Rome')
    ->between('09:00', '23:59')
    ->when(fn (): bool => now('Europe/Rome')->day === 16)
    ->withoutOverlapping(60);
