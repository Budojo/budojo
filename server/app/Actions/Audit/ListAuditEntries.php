<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\Academy;
use App\Models\AuditEntry;
use Carbon\CarbonImmutable;
use Illuminate\Pagination\LengthAwarePaginator;

// Filtered audit-log query scoped to one academy (#429 part 3).
class ListAuditEntries
{
    /**
     * @return LengthAwarePaginator<int, AuditEntry>
     */
    public function execute(
        Academy $academy,
        ?string $action = null,
        ?int $actorUserId = null,
        ?CarbonImmutable $from = null,
        ?CarbonImmutable $to = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
        int $perPage = 20,
    ): LengthAwarePaginator {
        $query = AuditEntry::query()
            ->where('academy_id', $academy->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id'); // tiebreak on same-second writes

        if ($action !== null && $action !== '') {
            $query->where('action', $action);
        }

        if ($actorUserId !== null) {
            $query->where('actor_user_id', $actorUserId);
        }

        if ($from !== null) {
            $query->where('created_at', '>=', $from);
        }

        if ($to !== null) {
            // Inclusive end-of-day: a user picking 2026-05-21 means
            // "through that day", not "up to midnight of that day".
            $query->where('created_at', '<=', $to->endOfDay());
        }

        if ($subjectType !== null && $subjectType !== '') {
            $query->where('subject_type', $subjectType);
        }

        if ($subjectId !== null) {
            $query->where('subject_id', $subjectId);
        }

        return $query->paginate($perPage);
    }
}
