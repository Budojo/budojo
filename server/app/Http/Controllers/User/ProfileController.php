<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\UpdateProfileAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Models\User;

/**
 * Self-edit controller for the authenticated user's profile (#463 + #479).
 * Lives under `/api/v1/me` and is auth:sanctum gated at the route level.
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

        // PATCH semantics: distinguish "key missing" (don't touch) from
        // "key present but null/empty" (clear). Without this, a name-only
        // PATCH from any non-SPA caller would silently wipe the handle.
        // The SPA itself always sends all three, so the missing-key
        // branch is the safety net for partial updates.
        $handle = $request->has('handle') ? $this->normalizeHandle($request->input('handle')) : $user->handle;

        // Optional attendance-peer-visibility opt-out (#958). `null` =
        // not in the payload → action preserves existing value.
        $peerVisible = $request->has('attendance_peer_visible')
            ? $request->boolean('attendance_peer_visible')
            : null;

        $updated = $this->action->execute(
            $user,
            $request->string('first_name')->toString(),
            $request->string('last_name')->toString(),
            $handle,
            $peerVisible,
        );

        // Eager-load every relation the UserResource projects so the
        // PATCH-/me response carries the same envelope shape /auth/me
        // does — keeps the SPA's cached user signal consistent across
        // read + write paths.
        $updated->load(['pendingDeletion', 'pendingEmailChange']);

        return new UserResource($updated);
    }

    /**
     * Normalize the validated handle payload. Empty string + null both
     * map to a clear (`null`); a real string is passed through verbatim
     * (the action lowercases on save).
     */
    private function normalizeHandle(mixed $value): ?string
    {
        if (\is_string($value) && $value !== '') {
            return $value;
        }

        return null;
    }
}
