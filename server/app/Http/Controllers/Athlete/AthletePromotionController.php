<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Promotion\CreateAthletePromotionAction;
use App\Actions\Promotion\DeleteAthletePromotionAction;
use App\Actions\Promotion\GetAthleteProgressionAction;
use App\Actions\Promotion\UpdateAthletePromotionRecordedAtAction;
use App\Authorization\Capability;
use App\Enums\Belt;
use App\Http\Controllers\Controller;
use App\Http\Requests\Promotion\StoreAthletePromotionRequest;
use App\Http\Requests\Promotion\UpdateAthletePromotionRequest;
use App\Http\Resources\AthletePromotionResource;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Owner-facing read + write of an athlete's belt + stripe promotion
 * history (post-v2.9.0 feature: "voglio ricordarmi quando ho dato la
 * striscia a chi"; editing + backfill added for #1431: "devo poter
 * riscrivere la storia di un atleta"). The athlete detail page renders
 * the result as a date-ordered timeline under the belt-and-status
 * header.
 *
 * Authorization: same shape as the rest of the academy-scoped athlete
 * surface — caller must be the owner of the athlete's academy.
 * Athletes can read their OWN promotion history; that path lives
 * under `/me/promotions` (#TBD) and isn't this controller's concern.
 */
class AthletePromotionController extends Controller
{
    public function __construct(
        private readonly UpdateAthletePromotionRecordedAtAction $updateRecordedAt,
        private readonly CreateAthletePromotionAction $createPromotion,
        private readonly DeleteAthletePromotionAction $deletePromotion,
        private readonly GetAthleteProgressionAction $progression,
    ) {
    }

    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->activeAcademyId() === null || $athlete->academy_id !== $user->activeAcademyId()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $promotions = $athlete->promotions()->with('recordedBy:id,first_name,last_name')->paginate(20);

        // Beside `data`, not in `meta`: `meta` is the pagination block the SPA
        // pages with, and overwriting it breaks paging (#1772). Computed once
        // here, because it does not change between pages of one timeline.
        return AthletePromotionResource::collection($promotions)
            ->additional(['progression' => $this->progression->execute($athlete)]);
    }

    /**
     * #1431 PR 1 of 2 — corrects `recorded_at` on an existing row. The
     * belt/stripe transition it describes, and who recorded it, are not
     * editable here; see `UpdateAthletePromotionRecordedAtAction` for why
     * this can't drag the athlete's current belt around.
     */
    public function update(UpdateAthletePromotionRequest $request, Athlete $athlete, AthletePromotion $promotion): JsonResponse
    {
        // Mirrors CarnetController::update's double-check: the FormRequest
        // authorizes against the athlete's academy, but a caller could
        // still pair a promotion id from a DIFFERENT athlete they don't
        // have with one they do — this confirms the promotion actually
        // belongs to the athlete in the path.
        if ($promotion->athlete_id !== $athlete->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $recordedAt = CarbonImmutable::make($request->date('recorded_at'));
        \assert($recordedAt instanceof CarbonImmutable); // `required` + `date_format` in the request

        $promotion = $this->updateRecordedAt->execute($promotion, $recordedAt);

        return response()->json([
            'data' => new AthletePromotionResource($promotion->load('recordedBy:id,first_name,last_name')),
        ]);
    }

    /**
     * #1431 PR 2 of 2 — backfills a historical promotion. Chain
     * consistency against the athlete's existing history is already
     * enforced by `StoreAthletePromotionRequest`; this just shapes the
     * validated input into the Action's typed parameters.
     */
    public function store(StoreAthletePromotionRequest $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $recordedAt = CarbonImmutable::make($request->date('recorded_at'));
        \assert($recordedAt instanceof CarbonImmutable); // `required` + `date_format` in the request

        $kind = $request->string('kind')->toString();
        $fromBelt = $request->string('from_belt')->toString();
        $toBelt = $request->string('to_belt')->toString();
        $beltAtEvent = $request->string('belt_at_event')->toString();

        $promotion = $this->createPromotion->execute(
            athlete: $athlete,
            kind: $kind,
            fromBelt: $fromBelt === '' ? null : Belt::from($fromBelt),
            toBelt: $toBelt === '' ? null : Belt::from($toBelt),
            fromStripes: $request->has('from_stripes') ? $request->integer('from_stripes') : null,
            toStripes: $request->has('to_stripes') ? $request->integer('to_stripes') : null,
            beltAtEvent: $beltAtEvent === '' ? null : Belt::from($beltAtEvent),
            recordedAt: $recordedAt,
            recordedByUserId: (int) $user->id,
        );

        return response()->json([
            'data' => new AthletePromotionResource($promotion->load('recordedBy:id,first_name,last_name')),
        ], 201);
    }

    /**
     * #1431 PR 2 of 2 — undoes a row entered by mistake. Hard delete, no
     * restore: see `DeleteAthletePromotionAction`.
     */
    public function destroy(Request $request, Athlete $athlete, AthletePromotion $promotion): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Same double-check as `update()`: the promotion in the path must
        // actually belong to the athlete in the path, not just any
        // promotion the caller's academy can reach.
        if (! $user->canInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate)
            || $promotion->athlete_id !== $athlete->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->deletePromotion->execute($promotion);

        return response()->json(null, 204);
    }
}
