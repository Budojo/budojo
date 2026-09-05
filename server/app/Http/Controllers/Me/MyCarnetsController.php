<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Payment\ListAthleteCarnetsAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\CarnetResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Athlete-portal carnet view (#1364).
 *
 * `GET /api/v1/me/carnets` — the authenticated athlete's own carnets, so
 * "quanti ingressi mi restano" stops being a question they have to ask the
 * instructor. Owners hit 404, same shape as `/me/payments`: they have no
 * personal ledger, and `/athletes/{id}/carnets` is their entry point.
 *
 * Reuses `ListAthleteCarnetsAction` so balance derivation and ordering are
 * identical across the two personas.
 */
class MyCarnetsController extends Controller
{
    public function __construct(
        private readonly ListAthleteCarnetsAction $list,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        return CarnetResource::collection($this->list->execute($athlete));
    }
}
