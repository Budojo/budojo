<?php

declare(strict_types=1);

namespace App\Http\Controllers\Audit;

use App\Actions\Audit\ListAuditEntries;
use App\Http\Controllers\Controller;
use App\Http\Requests\Audit\ListAuditEntriesRequest;
use App\Http\Resources\AuditEntryResource;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AuditEntriesController extends Controller
{
    public function __construct(
        private readonly ListAuditEntries $listAction,
    ) {
    }

    public function index(ListAuditEntriesRequest $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validated();
        $action = isset($validated['action']) && \is_string($validated['action']) ? $validated['action'] : null;
        $actorUserId = isset($validated['actor_user_id']) && is_numeric($validated['actor_user_id'])
            ? (int) $validated['actor_user_id']
            : null;
        // `!Y-m-d` zeroes the time portion (default Carbon parse takes the
        // current clock for the missing parts — would silently drift the
        // boundary on a midday request).
        $from = isset($validated['from']) && \is_string($validated['from'])
            ? CarbonImmutable::createFromFormat('!Y-m-d', $validated['from'])
            : null;
        $to = isset($validated['to']) && \is_string($validated['to'])
            ? CarbonImmutable::createFromFormat('!Y-m-d', $validated['to'])
            : null;
        $subjectType = isset($validated['subject_type']) && \is_string($validated['subject_type'])
            ? $validated['subject_type']
            : null;
        $subjectId = isset($validated['subject_id']) && is_numeric($validated['subject_id'])
            ? (int) $validated['subject_id']
            : null;
        $perPage = isset($validated['per_page']) && is_numeric($validated['per_page'])
            ? (int) $validated['per_page']
            : 20;

        $page = $this->listAction->execute(
            academy: $academy,
            action: $action,
            actorUserId: $actorUserId,
            from: $from instanceof CarbonImmutable ? $from : null,
            to: $to instanceof CarbonImmutable ? $to : null,
            subjectType: $subjectType,
            subjectId: $subjectId,
            perPage: $perPage,
        );

        return AuditEntryResource::collection($page);
    }
}
