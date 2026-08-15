<?php

declare(strict_types=1);

namespace App\Console\Schedules;

use Illuminate\Console\Scheduling\Schedule;

/**
 * A set of scheduled commands for one runtime profile (#1226).
 *
 * Two implementations, chosen by routes/console.php: the hosted wall-clock
 * schedule and the desktop cadence. The interface exists so each is a unit a
 * test can register into a fresh Schedule and inspect — no environment
 * juggling, no application reboot.
 */
interface ScheduleDefinition
{
    public function register(Schedule $schedule): void;
}
