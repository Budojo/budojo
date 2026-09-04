<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Payment\ListAthleteCarnetsAction;
use App\Actions\Payment\SellCarnetAction;
use App\Authorization\Capability;
use App\Http\Controllers\Controller;
use App\Http\Requests\Carnet\StoreCarnetRequest;
use App\Http\Resources\CarnetResource;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CarnetController extends Controller
{
    public function __construct(
        private readonly SellCarnetAction $sellAction,
        private readonly ListAthleteCarnetsAction $listAction,
    ) {
    }

    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->canInAcademy($athlete->academy_id, Capability::PaymentsRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return CarnetResource::collection($this->listAction->execute($athlete));
    }

    public function store(StoreCarnetRequest $request, Athlete $athlete): JsonResponse
    {
        // FormRequest::authorize() already enforced the capability in the
        // athlete's academy. The configuration gate lives here instead: it is
        // a state check on the academy, not on the payload, so it fails as a
        // 422 rather than a 403 — same split as AthletePaymentController.
        $academy = $athlete->academy;
        if ($academy === null || $academy->carnet_price_cents === null || $academy->carnet_entries === null) {
            return response()->json([
                'message' => 'Cannot sell a carnet — the academy carnet offering is not configured.',
                'errors' => $this->missingCarnetConfig($academy),
            ], 422);
        }

        $carnet = $this->sellAction->execute(
            athlete: $athlete,
            totalEntries: $academy->carnet_entries,
            priceCents: $academy->carnet_price_cents,
            purchasedAt: CarbonImmutable::make($request->date('purchased_at')) ?? CarbonImmutable::today(),
        );

        return response()->json(['data' => new CarnetResource($carnet)], 201);
    }

    /**
     * Names whichever half of the offering the owner still has to configure,
     * so the SPA can point at the right settings field.
     *
     * @return array<string, list<string>>
     */
    private function missingCarnetConfig(?Academy $academy): array
    {
        $errors = [];

        if ($academy === null || $academy->carnet_price_cents === null) {
            $errors['carnet_price_cents'] = ['The academy has not configured a carnet price.'];
        }

        if ($academy === null || $academy->carnet_entries === null) {
            $errors['carnet_entries'] = ['The academy has not configured how many entries a carnet holds.'];
        }

        return $errors;
    }
}
