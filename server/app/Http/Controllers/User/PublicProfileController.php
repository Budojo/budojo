<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\GetPublicProfileAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\PublicProfileResource;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Athlete public-profile lookup (#862, M9 social-profile epic slice A).
 *
 * Returns the public-profile view of a user identified by their handle.
 * The action enforces all three gates that produce a 404 — handle not
 * found, profile_is_public = false, cross-academy peer — so this surface
 * doesn't leak existence of users behind any of them.
 */
class PublicProfileController extends Controller
{
    public function show(Request $request, string $handle, GetPublicProfileAction $action): PublicProfileResource
    {
        $user = $request->user();
        if ($user === null) {
            // belt-and-braces: auth:sanctum should have 401'd already.
            throw new NotFoundHttpException();
        }

        $profile = $action->execute($handle, $user);

        return new PublicProfileResource($profile);
    }
}
