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

        // Eager-load the relations `UserResource` projects: the
        // deletion-pending grace-window record (#223) and the
        // email-change pending-then-verify row (#476). Both surface
        // optional blocks on the user envelope; the Resource itself
        // never lazy-loads — every call site loads explicitly so a
        // future caller-without-load shows up as `null` instead of an
        // N+1 query (#255 caught this gap on login + register the
        // first time around).
        $user->load(['pendingDeletion', 'pendingEmailChange']);

        return new UserResource($user);
    }
}
