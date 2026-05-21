<?php

declare(strict_types=1);

namespace App\Http\Controllers\Audit;

use App\Actions\Audit\ListAuditEntries;
use App\Http\Controllers\Controller;
use App\Http\Requests\Audit\ListAuditEntriesRequest;
use App\Http\Resources\AuditEntryResource;
use App\Models\User;
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

        $page = $this->listAction->execute(
            academy: $academy,
            action: $request->actionFilter(),
            actorUserId: $request->actorUserIdFilter(),
            from: $request->fromFilter(),
            to: $request->toFilter(),
            subjectType: $request->subjectTypeFilter(),
            subjectId: $request->subjectIdFilter(),
            perPage: $request->perPage(),
        );

        return AuditEntryResource::collection($page);
    }
}
