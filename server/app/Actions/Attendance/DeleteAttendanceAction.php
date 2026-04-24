<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\AttendanceRecord;

class DeleteAttendanceAction
{
    /**
     * Soft-delete an attendance record. No file cleanup (attendance records
     * carry no disk artifact — unlike documents), so this is a one-line
     * action. It still lives as a class for symmetry with the rest of
     * server/app/Actions, and to give future audit-trail logic (e.g.
     * recording who un-marked whom) a single home to land.
     */
    public function execute(AttendanceRecord $record): void
    {
        $record->delete();
    }
}
