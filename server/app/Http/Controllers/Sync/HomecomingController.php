<?php

declare(strict_types=1);

namespace App\Http\Controllers\Sync;

use App\Actions\Sync\ShowHomecomingAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Sync\SeenHomecomingRequest;
use App\Support\Sync\Homecoming;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * The homecoming («il rientro», #2039), for the card on Oggi:
 *
 * - `GET /api/v1/sync/homecoming`: what the other device's work brought, or
 *   204 when nothing waits to be seen.
 * - `DELETE /api/v1/sync/homecoming?through=<ulid>`: seen. A pull that added
 *   to it since keeps it.
 */
class HomecomingController extends Controller
{
    public function show(ShowHomecomingAction $show): JsonResponse|Response
    {
        $arrived = $show->execute();

        return $arrived === null ? response()->noContent() : response()->json(['data' => $arrived]);
    }

    public function seen(SeenHomecomingRequest $request): Response
    {
        Homecoming::seen($request->through());

        return response()->noContent();
    }
}
