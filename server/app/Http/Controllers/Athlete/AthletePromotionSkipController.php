<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Authorization\Capability;
use App\Enums\Belt;
use App\Http\Controllers\Controller;
use App\Http\Requests\Promotion\StorePromotionSkipRequest;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Saltato" and its undo on the promotion timeline's ghost rows (#1966).
 *
 * Both idempotent: a double tap is neither a second row nor an error, and an
 * undo of something already undone is a no-op — the owner's intent is the
 * state they end in, not the number of taps.
 */
class AthletePromotionSkipController extends Controller
{
    public function store(StorePromotionSkipRequest $request, Athlete $athlete): JsonResponse
    {
        $skip = $athlete->promotionSkips()->firstOrCreate([
            'belt' => $request->string('belt')->toString(),
            'stripes' => $request->integer('stripes'),
        ]);

        return response()->json([
            'data' => ['belt' => $skip->belt->value, 'stripes' => $skip->stripes],
        ], 201);
    }

    public function destroy(Request $request, Athlete $athlete, string $belt, int $stripes): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->canInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $known = Belt::tryFrom($belt);
        if ($known !== null) {
            $athlete->promotionSkips()->where('belt', $known->value)->where('stripes', $stripes)->delete();
        }

        return response()->json(null, 204);
    }
}
