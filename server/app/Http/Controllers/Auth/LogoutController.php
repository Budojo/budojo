<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * `POST /auth/logout` — revokes the token that made the request (#1227).
 *
 * Until now "sign out" only forgot the token client-side; the row stayed valid
 * until the user found it under Active sessions. The desktop shell keeps its
 * token in the OS keychain, so a sign-out there must also invalidate the
 * credential server-side — and the web gets the same courtesy for free.
 */
class LogoutController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $token = $request->user()?->currentAccessToken();

        if ($token instanceof \Laravel\Sanctum\PersonalAccessToken) {
            $token->delete();
        }

        return response()->noContent();
    }
}
