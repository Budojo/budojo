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

        // Eager-load the deletion-pending relation so `UserResource`
        // can surface the `deletion_pending` field without a lazy
        // follow-up query (#223). The Login + Register controllers
        // do the same now (#255 fixed the gap where they didn't,
        // and a user in the grace window saw `deletion_pending: null`
        // on the login response).
        $user->load('pendingDeletion');

        return new UserResource($user);
    }
}
