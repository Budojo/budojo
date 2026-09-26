<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AttendanceRecord;
use Illuminate\Notifications\DatabaseNotification;

/**
 * An alert that is no longer true leaves the inbox on its own (#1914).
 *
 * "Giorgi hasn't trained in a while" stops being true the moment Giorgi
 * checks in; the owner should not have to find it and tick it off. It is
 * archived — kept under "Archiviate", never deleted — for every owner who was
 * told, which on the desktop is the one.
 */
class ArchivesResolvedAlerts
{
    /**
     * Only the alerts raised by the end of the day the athlete came back. A
     * presence dated before an alert — an old register being filled in —
     * says nothing about whether they have come back since.
     */
    public function created(AttendanceRecord $record): void
    {
        DatabaseNotification::query()
            ->whereNull('archived_at')
            ->where('data->kind', 'owner_athlete_missed_streak')
            ->where('data->athlete_id', $record->athlete_id)
            ->where('created_at', '<=', $record->attended_on->copy()->endOfDay())
            ->update(['archived_at' => now()]);
    }
}
