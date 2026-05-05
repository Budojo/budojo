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
    public function __construct(private readonly RegisterUserAction $action)
    {
    }

    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $user = $this->action->execute(
            name: $request->string('name')->toString(),
            email: $request->string('email')->toString(),
            password: $request->string('password')->toString(),
            // The FormRequest's `accepted` rule has already confirmed
            // `terms_accepted` is truthy; the Action wants the moment
            // of consent as a typed timestamp, not the boolean.
            termsAcceptedAt: now(),
        );

        $token = $user->createToken('auth')->plainTextToken;

        // Eager-load the deletion-pending relation so `UserResource`
        // emits a coherent `deletion_pending` (always null for a
        // fresh registration; we still load to keep the invariant
        // that all UserResource consumers pre-load the relation).
        // Mirrors LoginController + MeController (#255).
        $user->load('pendingDeletion');

        return response()->json(
            [
                'data' => new UserResource($user),
                'token' => $token,
            ],
            201,
        );
    }
}
