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

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
        );
    }
}
