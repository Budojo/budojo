<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Thrown by `ScheduleAcademyChangeAction::execute()` when a second
 * future schedule POST races against an already-pending row (#1094).
 * The single-pending-future invariant is enforced inside a row-locked
 * transaction; the second request lands here and the controller
 * translates it to a 422 with the same validation-error shape as the
 * other rejected payloads.
 */
class PendingScheduleAlreadyExistsException extends \RuntimeException
{
}
