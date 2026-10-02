<?php

declare(strict_types=1);

namespace App\Http\Controllers\Device;

use App\Actions\Device\InspectBackupAction;
use App\Actions\Device\RestoreBackupAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * A backup the PC took, brought to this device by its own page (#2079). The
 * body is the archive itself.
 *
 * - `POST /api/v1/device/backup/inspect`: the academy it holds, and the one
 *   this device holds, for the owner to choose between. Nothing is written.
 * - `POST /api/v1/device/backup/restore`: staged, for the shell to swap in at
 *   its next start.
 */
class DeviceBackupController extends Controller
{
    public function inspect(Request $request, InspectBackupAction $inspect): JsonResponse
    {
        return response()->json(['data' => $inspect->execute(self::body($request))]);
    }

    public function restore(Request $request, RestoreBackupAction $restore): Response
    {
        $restore->execute(self::body($request));

        return response()->noContent();
    }

    /** @return resource */
    private static function body(Request $request)
    {
        $body = $request->getContent(true);
        if (! \is_resource($body)) {
            throw new \RuntimeException('could not read the incoming backup');
        }

        return $body;
    }
}
