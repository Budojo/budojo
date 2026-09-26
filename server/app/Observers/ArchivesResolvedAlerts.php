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
    public function created(AttendanceRecord $record): void
    {
        DatabaseNotification::query()
            ->whereNull('archived_at')
            ->where('data->kind', 'owner_athlete_missed_streak')
            ->where('data->athlete_id', $record->athlete_id)
            ->update(['archived_at' => now()]);
    }
}
