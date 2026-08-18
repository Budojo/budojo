<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Athlete\DeleteAthletePhotoAction;
use App\Actions\Athlete\UploadAthletePhotoAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\UploadAthletePhotoRequest;
use App\Http\Resources\AthleteResource;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The athlete's photo (#1357).
 *
 * The storage path is derived from the route parameter, which makes the academy
 * check the load-bearing line in this file rather than a formality: without it,
 * one gym could write files into another gym's namespace by guessing an id.
 */
class AthletePhotoController extends Controller
{
    public function __construct(
        private readonly UploadAthletePhotoAction $uploadAction,
        private readonly DeleteAthletePhotoAction $deleteAction,
    ) {
    }

    public function upload(UploadAthletePhotoRequest $request, Athlete $athlete): AthleteResource|JsonResponse
    {
        $denied = $this->denyIfOutsideAcademy($request, $athlete);
        if ($denied !== null) {
            return $denied;
        }

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $request->file('photo');

        return new AthleteResource($this->uploadAction->execute($athlete, $file));
    }

    public function destroy(Request $request, Athlete $athlete): AthleteResource|JsonResponse
    {
        $denied = $this->denyIfOutsideAcademy($request, $athlete);
        if ($denied !== null) {
            return $denied;
        }

        return new AthleteResource($this->deleteAction->execute($athlete));
    }

    /** Same shape the other athlete sub-resource controllers use. */
    private function denyIfOutsideAcademy(Request $request, Athlete $athlete): ?JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->activeAcademyId() === null || $athlete->academy_id !== $user->activeAcademyId()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return null;
    }
}
