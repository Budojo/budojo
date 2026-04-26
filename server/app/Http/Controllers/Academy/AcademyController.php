<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Academy\CreateAcademyAction;
use App\Actions\Academy\DeleteAcademyLogoAction;
use App\Actions\Academy\UpdateAcademyAction;
use App\Actions\Academy\UploadAcademyLogoAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Academy\StoreAcademyRequest;
use App\Http\Requests\Academy\UpdateAcademyRequest;
use App\Http\Requests\Academy\UploadAcademyLogoRequest;
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
        private readonly UploadAcademyLogoAction $uploadLogoAction,
        private readonly DeleteAcademyLogoAction $deleteLogoAction,
    ) {
    }

    /**
     * Pulls `training_days` out of the validated payload as a `list<int>|null`.
     * The FormRequest enforces the value shape (array of ints in 0..6, no
     * duplicates) so this just narrows the static type for the action.
     *
     * @param  array<string, mixed>  $validated
     * @return list<int>|null
     */
    private function trainingDaysFromValidated(array $validated): ?array
    {
        if (! \array_key_exists('training_days', $validated)) {
            return null;
        }

        $value = $validated['training_days'];
        if ($value === null) {
            return null;
        }

        // FormRequest already validated each entry as int between 0..6.
        // Re-cast defensively so PHPStan sees a guaranteed `list<int>`.
        $list = [];
        foreach ((array) $value as $day) {
            if (\is_int($day)) {
                $list[] = $day;
            }
        }

        return $list;
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
                trainingDays: $this->trainingDaysFromValidated($request->validated()),
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

    public function uploadLogo(UploadAcademyLogoRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var \App\Models\Academy $academy */
        $academy = $user->academy;

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $request->file('logo');
        $academy = $this->uploadLogoAction->execute($academy, $file);

        return response()->json(['data' => new AcademyResource($academy)]);
    }

    public function deleteLogo(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 404);
        }

        $academy = $this->deleteLogoAction->execute($academy);

        return response()->json(['data' => new AcademyResource($academy)]);
    }
}
