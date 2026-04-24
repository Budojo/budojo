<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Academy\CreateAcademyAction;
use App\Actions\Academy\UpdateAcademyAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Academy\StoreAcademyRequest;
use App\Http\Requests\Academy\UpdateAcademyRequest;
use App\Http\Resources\AcademyResource;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AcademyController extends Controller
{
    public function __construct(
        private readonly CreateAcademyAction $createAction,
        private readonly UpdateAcademyAction $updateAction,
    ) {
    }

    public function store(StoreAcademyRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        try {
            $academy = $this->createAction->execute(
                user: $user,
                name: $request->string('name')->toString(),
                address: $request->filled('address') ? $request->string('address')->toString() : null,
            );
        } catch (UniqueConstraintViolationException) {
            return response()->json(['message' => 'Academy already exists.'], 409);
        }

        return response()->json(['data' => new AcademyResource($academy)], 201);
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 404);
        }

        return response()->json(['data' => new AcademyResource($academy)]);
    }

    public function update(UpdateAcademyRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var \App\Models\Academy $academy */
        $academy = $user->academy; // authorize() guarantees non-null

        $academy = $this->updateAction->execute($academy, $request->validated());

        return response()->json(['data' => new AcademyResource($academy)]);
    }
}
