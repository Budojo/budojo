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

        // Eager-load the relations the `UserResource` projects so the
        // wire envelope reflects reality immediately on login. Without
        // this, a user already in the 30-day grace window (#223) or
        // with an outstanding email-change request (#476) would see
        // the corresponding block as `null` and only learn the true
        // state from the next /auth/me bootstrap call. Two indexed
        // queries against small tables (#255 caught the first half).
        $user->load(['pendingDeletion', 'pendingEmailChange']);

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
        );
    }
}
