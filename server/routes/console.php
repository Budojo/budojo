<?php

declare(strict_types=1);

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function (): void {
    $this->comment(Inspiring::quote()); // @phpstan-ignore-line
})->purpose('Display an inspiring quote');

// GDPR Art. 17 (#223) — hourly purge of pending deletions whose grace
// window has elapsed. Hourly is the compromise: the window is 30 days,
// so user-visible latency between expiry and purge is at most 1 hour
// (well within "without undue delay"). The command is idempotent and
// catches per-user failures so a single stuck row doesn't block the
// rest of the cohort.
\Illuminate\Support\Facades\Schedule::command('budojo:purge-expired-pending-deletions')
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
\Illuminate\Support\Facades\Schedule::command('budojo:purge-expired-email-changes')
    ->hourly()
    ->withoutOverlapping(60);

// Daily digest of medical certificates expiring at T-30 / T-7 / T-0
// per academy (M5 PR-D). Runs at 09:00 Europe/Rome — early enough
// that an instructor reading their inbox over morning coffee can
// chase renewal with a phone call before evening training. The
// command is per-academy idempotent via the notification_log unique
// index, so a re-run on the same day is a fast no-op.
\Illuminate\Support\Facades\Schedule::command('budojo:send-medical-cert-expiry-reminders')
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
\Illuminate\Support\Facades\Schedule::command('budojo:send-unpaid-athletes-digest')
    ->monthlyOn(16, '09:00')
    ->timezone('Europe/Rome')
    ->withoutOverlapping(60);
