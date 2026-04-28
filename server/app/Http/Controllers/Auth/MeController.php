<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Returns the currently authenticated user. The SPA calls this on bootstrap
 * (after page reload) so it can render verification state without waiting
 * for the next register/login round-trip — the auth response shape would
 * otherwise be the only carrier of `email_verified_at`.
 */
class MeController extends Controller
{
    public function __invoke(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        return new UserResource($user);
    }
}
