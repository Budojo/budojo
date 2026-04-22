<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RegisterUserAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;

class RegisterController extends Controller
{
    public function __construct(private readonly RegisterUserAction $action) {}

    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $user = $this->action->execute(
            name: $request->string('name')->toString(),
            email: $request->string('email')->toString(),
            password: $request->string('password')->toString(),
        );

        $token = $user->createToken('auth')->plainTextToken;

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
            201,
        );
    }
}
