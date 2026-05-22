<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\AttendanceRecord;

/**
 * Outcome of `MarkTodayAttendanceAction::execute()` (#960). The
 * controller maps each branch to the corresponding HTTP status
 * (201 / 200 / 422); keeping the branch shape in the action keeps
 * the business rules (training-day check + idempotency) out of the
 * HTTP layer.
 */
final class MarkTodayResult
{
    private function __construct(
        public readonly string $status,
        public readonly ?AttendanceRecord $record,
    ) {
    }

    public static function created(AttendanceRecord $record): self
    {
        return new self('created', $record);
    }

    public static function existed(AttendanceRecord $record): self
    {
        return new self('existed', $record);
    }

    public static function notTrainingDay(): self
    {
        return new self('not_training_day', null);
    }
}
