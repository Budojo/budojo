<?php

declare(strict_types=1);

namespace App\Support\Http;

use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * A request this server makes to its own API, as a user, through the whole
 * stack: the routes' FormRequests, policies, Actions and middleware decide,
 * the journal included, as they would for the page. The request the caller
 * is serving, and its user, are put back after.
 */
final class SubRequest
{
    /** @return array{0: int, 1: mixed} the status, and the decoded answer */
    public static function send(User $user, string $method, string $uri, mixed $body): array
    {
        $request = Request::create(
            $uri,
            $method,
            [],
            [],
            [],
            ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'],
            $body === null ? null : (string) json_encode($body, JSON_THROW_ON_ERROR),
        );
        $previousRequest = app()->bound('request') ? app('request') : null;
        $previousUser = Auth::guard('sanctum')->user();
        Auth::guard('sanctum')->setUser($user);

        try {
            $response = app(Kernel::class)->handle($request);
        } finally {
            if ($previousRequest !== null) {
                app()->instance('request', $previousRequest);
            }
            if ($previousUser !== null) {
                Auth::guard('sanctum')->setUser($previousUser);
            } else {
                app('auth')->forgetGuards();
            }
        }
        $content = $response->getContent();

        return [$response->getStatusCode(), \is_string($content) ? json_decode($content, true) : null];
    }
}
