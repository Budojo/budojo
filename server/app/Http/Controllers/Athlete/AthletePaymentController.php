<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Payment\DeleteAthletePaymentAction;
use App\Actions\Payment\ListAthletePaymentsAction;
use App\Actions\Payment\RecordAthletePaymentAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payment\StoreAthletePaymentRequest;
use App\Http\Resources\AthletePaymentResource;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AthletePaymentController extends Controller
{
    public function __construct(
        private readonly RecordAthletePaymentAction $recordAction,
        private readonly ListAthletePaymentsAction $listAction,
        private readonly DeleteAthletePaymentAction $deleteAction,
    ) {
    }

    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $year = $request->integer('year', (int) now()->year);

        return AthletePaymentResource::collection(
            $this->listAction->execute($athlete, $year),
        );
    }

    public function store(StoreAthletePaymentRequest $request, Athlete $athlete): JsonResponse
    {
        // FormRequest::authorize() already enforced cross-academy ownership.
        // The fee gate is here (not in the request) because it's a state
        // check on the *target* row, not on the input payload — failing it
        // is a 422 ("can't record a payment when no fee is set"), not a
        // 403 ("you can't touch this resource at all"). The academy null
        // check is defensive — authorize() guarantees it, but PHPStan
        // can't follow that invariant across class boundaries.
        $academy = $athlete->academy;
        if ($academy === null || $academy->monthly_fee_cents === null) {
            return response()->json([
                'message' => 'Cannot record payment — academy monthly fee is not configured.',
                'errors' => [
                    'monthly_fee_cents' => ['The academy has not configured a monthly fee.'],
                ],
            ], 422);
        }

        $payment = $this->recordAction->execute(
            athlete: $athlete,
            year: $request->integer('year'),
            month: $request->integer('month'),
            amountCents: $academy->monthly_fee_cents,
        );

        return response()->json(['data' => new AthletePaymentResource($payment)], 201);
    }

    public function destroy(Request $request, Athlete $athlete, int $year, int $month): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $deleted = $this->deleteAction->execute($athlete, $year, $month);

        if (! $deleted) {
            return response()->json(['message' => 'Payment not found.'], 404);
        }

        return response()->json(null, 204);
    }

    private function userOwns(User $user, Athlete $athlete): bool
    {
        return $user->academy !== null
            && $athlete->academy_id === $user->academy->id;
    }
}
