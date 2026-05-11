<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Models\CommunityPost;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Paginated community-feed query (#612, M9 PR-B server). Resolves the
 * authenticated user's academy via their role and returns the academy's
 * community posts in descending-created-at order.
 *
 * **Tenant isolation rule (M9 PRD § Hard rules):** every read of the
 * feed surface is scoped via `WHERE academy_id = ?`. Owner reads
 * `$user->academy->id`; athletes read `$user->athlete->academy_id`.
 * A user without an academy (rare — pre-setup owners or a malformed
 * athlete state) gets an empty paginator instead of a 500.
 *
 * Pre-eager-loads the relations the `CommunityPostResource` projects
 * to keep the feed roundtrip to one SQL + as many extra queries as
 * eager-loaded associations (N+1-safe).
 */
class GetCommunityFeedAction
{
    /**
     * @return LengthAwarePaginator<int, CommunityPost>
     */
    public function execute(User $user, int $perPage = 20): LengthAwarePaginator
    {
        $academyId = $this->resolveAcademyId($user);

        if ($academyId === null) {
            // Edge: no academy associated — return an empty paginator
            // built from an always-false query so consumers handle one
            // shape, not two.
            return CommunityPost::query()
                ->whereRaw('1 = 0')
                ->paginate($perPage);
        }

        return $this->baseQuery($academyId)
            ->with([
                'createdBy:id,first_name,last_name,handle,avatar_path',
                'createdBy.athlete:id,user_id,belt',
            ])
            ->withCount(['reactions', 'comments', 'rsvps'])
            ->paginate($perPage);
    }

    /** @return Builder<CommunityPost> */
    private function baseQuery(int $academyId): Builder
    {
        return CommunityPost::query()
            ->where('academy_id', $academyId)
            ->orderByDesc('created_at');
    }

    private function resolveAcademyId(User $user): ?int
    {
        if ($user->isOwner()) {
            return $user->academy?->id;
        }

        // Athlete persona — academy is on the linked athlete row.
        return $user->athlete?->academy_id;
    }
}
