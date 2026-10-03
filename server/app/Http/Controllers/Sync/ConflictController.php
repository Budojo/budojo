<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\DecideConflictAction;
use App\Actions\Sync\ListConflictsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Sync\DecideConflictRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * «Da decidere» (#2031, #2038, PRD § 6.4): the writes a rebase set aside.
 *
 * - `GET /api/v1/sync/conflicts`: those that wait for the owner.
 * - `POST /api/v1/sync/conflicts/{entry}/decision`: the owner's answer.
 */
class ConflictController extends Controller
{
    public function index(ListConflictsAction $list): JsonResponse
    {
        return response()->json(['data' => $list->execute()]);
    }

    public function decide(DecideConflictRequest $request, string $entry, DecideConflictAction $decide): Response
    {
        $decide->execute($entry, $request->decision());

        return response()->noContent();
    }
}
