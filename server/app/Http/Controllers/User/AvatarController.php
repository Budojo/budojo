<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\DeleteAvatarAction;
use App\Actions\User\UploadAvatarAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\UploadAvatarRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * `POST /me/avatar` and `DELETE /me/avatar` — user-avatar lifecycle (#411).
 * Mirrors the academy-logo pair on `AcademyController`. Thin: validate via
 * FormRequest, delegate to the dedicated Action, return the user as
 * `UserResource` so the SPA's existing `/auth/me` consumer can swap the
 * cached envelope without a second round-trip.
 */
class AvatarController extends Controller
{
    public function __construct(
        private readonly UploadAvatarAction $uploadAction,
        private readonly DeleteAvatarAction $deleteAction,
    ) {
    }

    public function upload(UploadAvatarRequest $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $request->file('avatar');
        $user = $this->uploadAction->execute($user, $file);

        // The auth/me / login responses load `pendingDeletion` so the
        // resource can surface the GDPR Art. 17 grace block. Mirror the
        // load here so `avatar` mutations return a consistent envelope —
        // a user in the deletion grace window who replaces their avatar
        // still sees the warning banner.
        $user->load('pendingDeletion');

        return new UserResource($user);
    }

    public function delete(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();
        $user = $this->deleteAction->execute($user);
        $user->load('pendingDeletion');

        return new UserResource($user);
    }
}
