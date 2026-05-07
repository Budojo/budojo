<?php

declare(strict_types=1);

namespace App\Http\Controllers\Search;

use App\Actions\Search\SearchAcademyAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\AthleteResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Single-action invokable controller backing the global Cmd/Ctrl-K
 * command palette (#426). Returns up to 20 athletes in the authenticated
 * user's academy that match the free-text `?q=` parameter.
 *
 * V1 surface is intentionally narrow — only athletes by name. The PRD
 * lists academy and payment indexing as V2 concerns; we keep the route
 * `/search` (not `/search/athletes`) so the V2 expansion lands without
 * a SPA URL bump.
 */
class SearchController extends Controller
{
    public function __construct(
        private readonly SearchAcademyAction $search,
    ) {
    }

    public function __invoke(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            // Mirrors AthleteController::index — a user without an academy
            // gets a structured 403, not a 500 from a null relation. The
            // SPA's auth interceptor pattern already handles 403 envelopes
            // for verification-required; a no-academy user shouldn't be
            // able to open the palette in the first place (the dashboard
            // shell is gated by hasAcademyGuard).
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $query = \is_string($request->input('q')) ? $request->input('q') : '';
        $athletes = $this->search->execute($user->academy, $query);

        return AthleteResource::collection($athletes);
    }
}
