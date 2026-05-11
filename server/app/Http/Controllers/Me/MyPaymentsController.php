<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Payment\ListAthletePaymentsAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\AthletePaymentResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Athlete-portal payment history (M7 PR-D slice 4).
 *
 * `GET /api/v1/me/payments?year=` — returns the authenticated
 * athlete's monthly payment rows for the given calendar year
 * (defaults to current year). Owners hit 404 (they don't have a
 * personal payment ledger; the `/athletes/{id}/payments` surface
 * is the right entry point for any athlete's history).
 *
 * Reuses `ListAthletePaymentsAction` (already built for the owner
 * surface) so the read semantics + ordering match across personas.
 */
class MyPaymentsController extends Controller
{
    public function __construct(
        private readonly ListAthletePaymentsAction $list,
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

        $year = $request->integer('year', (int) now()->year);

        return AthletePaymentResource::collection(
            $this->list->execute($athlete, $year),
        );
    }
}
