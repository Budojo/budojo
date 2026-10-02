<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route gate for what only the app's own page may ask of its server (#2079,
 * PRD § 5.4): a session with no password, and replacing the academy.
 *
 * The server listens on `127.0.0.1`, where every other app on the phone can
 * reach it too. The shell makes a secret at each launch, hands it to PHP
 * (`BUDOJO_SHELL_SECRET`) and to its own page, and nothing else learns it.
 * Without the secret configured nothing passes. Answers 404, as
 * `RequireCapability` does: a surface that is not there for the caller
 * does not advertise itself.
 */
class RequireShell
{
    public const string HEADER = 'X-Budojo-Shell';

    public function handle(Request $request, \Closure $next): Response
    {
        $secret = config('budojo.shell.secret');
        $offered = $request->header(self::HEADER);
        if (! \is_string($secret) || $secret === '' || ! \is_string($offered) || ! hash_equals($secret, $offered)) {
            return new JsonResponse(['message' => 'Not Found.'], 404);
        }

        return $next($request);
    }
}
