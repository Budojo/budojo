<?php

declare(strict_types=1);

use App\Console\Schedules\DesktopSchedule;
use App\Console\Schedules\WebSchedule;
use App\Support\Runtime;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function (): void {
    $this->comment(Inspiring::quote()); // @phpstan-ignore-line
})->purpose('Display an inspiring quote');

// One schedule definition per runtime profile (#1226). The hosted one is
// wall-clock anchors run by cron; the desktop has no cron and is closed most
// of the day, so its cadence is different — see DesktopSchedule. This file
// only chooses; the definitions live in App\Console\Schedules where a test
// can register them into a fresh Schedule and look.
$definition = Runtime::isDesktop() ? new DesktopSchedule() : new WebSchedule();
$definition->register(app(Schedule::class));
