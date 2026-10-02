<?php

declare(strict_types=1);

namespace App\Http\Controllers\Device;

use App\Actions\Device\OpenOwnerSessionAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Support\UserAgentLabel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /api/v1/device/session`: the owner's session, for the shell's own page
 * (#2079). The same answer as a login; `404` `no_owner` on a device nobody
 * has set up or restored yet.
 */
class DeviceSessionController extends Controller
{
    public function __invoke(Request $request, OpenOwnerSessionAction $open): JsonResponse
    {
        $session = $open->execute(UserAgentLabel::fromUserAgent($request->userAgent() ?? ''));
        if ($session === null) {
            return response()->json(['code' => 'no_owner', 'message' => 'Nobody has set up Budojo on this device yet.'], 404);
        }
        $session['user']->load(['pendingDeletion', 'pendingEmailChange']);

        return response()->json(['data' => new UserResource($session['user']), 'token' => $session['token']]);
    }
}
