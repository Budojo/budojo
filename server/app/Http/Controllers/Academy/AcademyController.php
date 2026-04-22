<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Academy\CreateAcademyAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Academy\StoreAcademyRequest;
use App\Http\Resources\AcademyResource;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AcademyController extends Controller
{
    public function __construct(private readonly CreateAcademyAction $createAction)
    {
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
}
