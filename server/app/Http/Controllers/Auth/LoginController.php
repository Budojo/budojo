<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LoginUserAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;

class LoginController extends Controller
{
    public function __construct(private readonly LoginUserAction $action)
    {
    }

    public function __invoke(LoginRequest $request): JsonResponse
    {
        $user = $this->action->execute(
            email: $request->string('email')->toString(),
            password: $request->string('password')->toString(),
        );

        if ($user === null) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $token = $user->createToken('auth')->plainTextToken;

        // Eager-load the deletion-pending relation so the SPA's
        // `deletion_pending` block on the login response reflects
        // reality immediately — without it, a user already in the
        // 30-day grace window would see `deletion_pending: null` on
        // login and only learn the true state from the next /auth/me
        // bootstrap call. Single indexed query against a small table
        // (#255).
        $user->load('pendingDeletion');

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
        );
    }
}
