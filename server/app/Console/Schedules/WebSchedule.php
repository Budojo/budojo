<?php

declare(strict_types=1);

namespace App\Console\Schedules;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;

/**
 * The hosted schedule: wall-clock anchors, run by a system cron every minute
 * of every day. Every command carries its own rationale.
 *
 * A class rather than a bare routes file so the definitions are a unit that
 * can be registered into a fresh Schedule and asserted on. The desktop twin
 * (DesktopSchedule) exists because the cadence differs by runtime, and
 * routes/console.php only chooses between them.
 */
final class WebSchedule implements ScheduleDefinition
{
    public function register(Schedule $schedule): void
    {
        // GDPR Art. 17 (#223) — hourly purge of pending deletions whose grace
        // window has elapsed. Hourly is the compromise: the window is 30 days,
        // so user-visible latency between expiry and purge is at most 1 hour
        // (well within "without undue delay"). The command is idempotent and
        // catches per-user failures so a single stuck row doesn't block the
        // rest of the cohort.
        $schedule->command('budojo:purge-expired-pending-deletions')
            ->hourly()
            ->withoutOverlapping(60); // 60-min lock window — protects against a slow run getting double-scheduled.

        // Email-change-with-verification (#476) — hourly cleanup of
        // `pending_email_changes` rows whose 24h verification window has
        // elapsed. The token in each row is one-shot and the action's
        // `isExpired()` branch already drops a row on a verify attempt; this
        // command sweeps the unredeemed cohort so the table doesn't accrue
        // stale entries forever and the UNIQUE(user_id) upsert path stays
        // fast. Capped at 1000 deletes per run for safety; hourly cadence
        // absorbs any backlog without ever locking the table for an
        // unbounded delete sweep.
        $schedule->command('budojo:purge-expired-email-changes')
            ->hourly()
            ->withoutOverlapping(60);

        // Daily digest of medical certificates expiring at T-30 / T-7 / T-0
        // per academy (M5 PR-D). Runs at 09:00 Europe/Rome — early enough
        // that an instructor reading their inbox over morning coffee can
        // chase renewal with a phone call before evening training. The
        // command is per-academy idempotent via the notification_log unique
        // index, so a re-run on the same day is a fast no-op.
        $schedule->command('budojo:send-medical-cert-expiry-reminders')
            ->dailyAt('09:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // Monthly digest of athletes still unpaid for the current month
        // (M5 PR-E). Runs once on the 16th at 09:00 Europe/Rome — the date
        // the dashboard's `unpaid-this-month-widget` starts surfacing the
        // "still owe" signal. Pre-15 most customers settle in the standard
        // month-start window so a digest before then is noise. Per-academy
        // idempotent via the same notification_log unique index used by
        // the cert-expiry digest.
        $schedule->command('budojo:send-unpaid-athletes-digest')
            ->monthlyOn(16, '09:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // Athlete-side overdue payment push (#729 B4). 09:00 Europe/Rome on
        // the 6th — past the typical month-start payment window, well before
        // the owner's day-16 digest, so the athlete has time to settle the
        // fee before it becomes a chase-list item for the instructor. Same
        // "Active athletes only + linked user_id + category opt-in" gates
        // the SendAthleteTrainingTodayPushes command uses.
        $schedule->command('budojo:send-athlete-payment-overdue-pushes')
            ->monthlyOn(6, '09:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // Daily engagement-signal push to academy owners when an active
        // athlete has missed the last 3 scheduled trainings (#729 C3). Same
        // daily 09:30 Europe/Rome window the medical-cert digest runs in.
        // The command's internal 14-day de-dup prevents spamming the owner
        // daily for the same athlete; once the streak is acknowledged, the
        // next ping waits until either the athlete trains again (resets the
        // streak) or another 14 days pass.
        $schedule->command('budojo:send-athlete-missed-streak-pushes')
            ->dailyAt('09:30')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // Daily 07:00 Europe/Rome push reminder to athletes whose academy
        // trains today and who have NOT been marked present yet (#729 A2).
        // Per-athlete gate on `athlete_training_today` notification category
        // + a same-day attendance-record check to skip athletes already
        // present (open-mat early-mat scenario). The command also runs an
        // inbox-level same-day dedup before each notify(), so manual reruns
        // or mis-scheduled invocations don't re-push the same athlete
        // multiple times in a day (Copilot review on #730).
        $schedule->command('budojo:send-athlete-training-today-pushes')
            ->dailyAt('07:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(30);

        // Weekly recap fanout (#960). Fires Sunday 19:00 local — domenica
        // sera è planning-time, l'utente guarda indietro alla settimana
        // appena finita e in avanti a quella che arriva. Skipped athletes
        // with zero sessions (no pity push). Inbox dedup against the
        // (user, iso_week_start) tuple makes a manual rerun on Monday a
        // no-op.
        $schedule->command('budojo:send-weekly-recap-pushes')
            ->weeklyOn(Carbon::SUNDAY, '19:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(30);

        // Time-based achievement evaluator (#961). Runs nightly at 02:00
        // local to pick up anniversary + 30-day-streak crossings that can't
        // be event-driven (no attendance row means the AttendanceObserver
        // never fires; the date alone closes the window).
        $schedule->command('budojo:evaluate-time-based-achievements')
            ->dailyAt('02:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // Daily prune of `login_attempts` rows older than 90 days (#430).
        // The login-history audit log is high-write (one row per login
        // attempt, success or failure); without retention the table grows
        // unbounded. 90 days is the discipline disclosed in `/privacy` §
        // Sicurezza and the DPA template. Runs at 03:00 Europe/Rome —
        // off-peak, so the bulk delete doesn't compete with a busy login
        // hour. Capped at 5000 deletes per run; daily cadence absorbs any
        // volume spike.
        $schedule->command('budojo:purge-expired-login-attempts')
            ->dailyAt('03:00')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);

        // GDPR retention for medical certificates (#537, DPIA-lite § R6).
        // Daily purge of medical certs whose `expires_at` is older than
        // 24 months. Same code path the athlete-removal cascade uses
        // (`DeleteDocumentAction` — unlinks file bytes + soft-deletes row).
        // Runs at 03:15 Europe/Rome — staggered after the login-attempts
        // purge to keep the off-peak window single-threaded. Capped at
        // 500 purges per run; daily cadence comfortably absorbs even a
        // large multi-academy backlog.
        $schedule->command('budojo:purge-expired-medical-certificates')
            ->dailyAt('03:15')
            ->timezone('Europe/Rome')
            ->withoutOverlapping(60);
    }
}
