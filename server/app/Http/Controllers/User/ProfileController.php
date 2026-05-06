<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\UpdateProfileAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;

/**
 * Self-edit controller for the authenticated user's profile (#463).
 *
 * Lives under `/api/v1/me` and is auth:sanctum gated at the route
 * level — `UpdateProfileRequest::authorize()` keeps the additional
 * "must be a logged-in user" gate as a defence-in-depth check.
 */
class ProfileController extends Controller
{
    public function __construct(private readonly UpdateProfileAction $action)
    {
    }

    public function update(UpdateProfileRequest $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        $updated = $this->action->execute($user, $request->string('name')->toString());

        // Eager-load the deletion-pending relation so UserResource
        // emits the same envelope shape /me does — keeps the SPA's
        // cached user signal consistent across read + write paths.
        $updated->load('pendingDeletion');

        return new UserResource($updated);
    }
}
