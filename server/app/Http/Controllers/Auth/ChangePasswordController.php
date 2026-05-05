<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ChangePasswordAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * `POST /api/v1/me/password` (#409) — change the authenticated user's
 * password from inside the app. Re-auth gate + new-vs-old gate live in
 * `ChangePasswordRequest`; the action writes the hash and revokes
 * other Sanctum tokens. Single-purpose `__invoke` controller — no
 * other HTTP verb belongs here.
 */
class ChangePasswordController extends Controller
{
    public function __construct(private readonly ChangePasswordAction $action)
    {
    }

    public function __invoke(ChangePasswordRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->action->execute(
            user: $user,
            newPassword: $request->string('password')->toString(),
        );

        return response()->json(['message' => 'Password updated.']);
    }
}
