<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\ClearJournalAction;
use App\Actions\Sync\ListJournalAction;
use App\Actions\Sync\ReadHoldsAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The journal, for the app that packs versions (#2031):
 *
 * - `GET /api/v1/sync/journal`: this device's kept entries.
 * - `DELETE /api/v1/sync/journal?through=<ulid>`: clear them up to one every
 *   other device holds.
 * - `GET /api/v1/sync/holds`: per device, the newest entry this database holds.
 */
class JournalController extends Controller
{
    public function index(ListJournalAction $list): JsonResponse
    {
        return response()->json(['data' => $list->execute(self::device())]);
    }

    public function destroy(Request $request, ClearJournalAction $clear): Response
    {
        $validated = $request->validate(['through' => ['required', 'string', 'regex:/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/']]);
        $clear->execute(self::device(), (string) $validated['through']);

        return response()->noContent();
    }

    public function holds(ReadHoldsAction $holds): JsonResponse
    {
        return response()->json(['data' => (object) $holds->execute()]);
    }

    /** Unpaired, a device has no journal: nothing to list or clear. */
    private static function device(): string
    {
        $device = config('budojo.sync.device');

        return \is_string($device) ? $device : '';
    }
}
