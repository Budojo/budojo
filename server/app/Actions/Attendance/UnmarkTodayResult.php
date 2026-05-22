<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

/**
 * Outcome of `UnmarkTodayAttendanceAction::execute()` (#960). The
 * controller maps each case to the corresponding HTTP status (204 /
 * 204 / 403); putting the branch shape in the action keeps the
 * business rule out of the HTTP layer.
 */
enum UnmarkTodayResult: string
{
    case Deleted = 'deleted';
    case NoRow = 'no_row';
    case InstructorLocked = 'instructor_locked';
}
