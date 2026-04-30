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
