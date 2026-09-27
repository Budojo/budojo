<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\PaymentsArrearsAction;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\OperatorDay;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Who is behind, since when, and by how much (#1760). */
class PaymentsArrearsController extends Controller
{
    public function __construct(
        private readonly PaymentsArrearsAction $arrears,
    ) {
    }

    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => $this->arrears->execute($academy, OperatorDay::today())]);
    }
}
