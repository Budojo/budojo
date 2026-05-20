<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\AthletePromotion;
use App\Models\User;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Resolve a user's public-profile snapshot by handle (#862, M9 social-profile
 * epic slice A).
 *
 * Three gates that all collapse to 404 (no existence leak):
 *
 *  1. Handle is null / unknown.
 *  2. `profile_is_public = false` (the target user opted out).
 *  3. Cross-academy peer — same academy as the viewer is required.
 *
 * Returns a plain array shape the Resource projects; the Action stays
 * framework-light so PEST can call it without booting the HTTP stack.
 */
class GetPublicProfileAction
{
    /**
     * @return array{
     *     id: int,
     *     first_name: string,
     *     handle: string,
     *     avatar_url: string|null,
     *     belt: string|null,
     *     joined_at: string|null,
     *     promotions: list<array{
     *         id: int,
     *         kind: 'belt'|'stripe',
     *         from_belt: string|null,
     *         to_belt: string|null,
     *         from_stripes: int|null,
     *         to_stripes: int|null,
     *         belt_at_event: string|null,
     *         recorded_at: string,
     *     }>,
     * }
     */
    public function execute(string $handle, User $viewer): array
    {
        $target = User::query()
            ->where('handle', $handle)
            ->where('profile_is_public', true)
            ->first();

        if ($target === null) {
            throw new NotFoundHttpException();
        }

        // Same-academy gate. The viewer needs an academy (owner via active
        // pointer, athlete via linked row) AND the target must have an
        // athlete row in that same academy. Owners-without-academy and
        // cross-academy combinations both 404.
        $viewerAcademyId = $this->academyIdOf($viewer);
        if ($viewerAcademyId === null) {
            throw new NotFoundHttpException();
        }

        $targetAthlete = $target->athlete()
            ->where('academy_id', $viewerAcademyId)
            ->first();

        if ($targetAthlete === null) {
            throw new NotFoundHttpException();
        }

        $promotions = array_values(
            AthletePromotion::query()
                ->where('athlete_id', $targetAthlete->id)
                ->orderByDesc('recorded_at')
                ->limit(50)
                ->get()
                ->map(fn (AthletePromotion $p): array => [
                    'id' => $p->id,
                    'kind' => $p->kind,
                    'from_belt' => $p->from_belt?->value,
                    'to_belt' => $p->to_belt?->value,
                    'from_stripes' => $p->from_stripes,
                    'to_stripes' => $p->to_stripes,
                    'belt_at_event' => $p->belt_at_event->value,
                    'recorded_at' => $p->recorded_at->toIso8601String(),
                ])
                ->all()
        );

        return [
            'id' => $target->id,
            'first_name' => $target->first_name,
            'handle' => $target->handle ?? '',
            'avatar_url' => $target->avatar_url,
            'belt' => $targetAthlete->belt->value,
            'joined_at' => $targetAthlete->joined_at->toDateString(),
            'promotions' => $promotions,
        ];
    }

    private function academyIdOf(User $user): ?int
    {
        if ($user->isOwner()) {
            return $user->activeAcademyId();
        }

        return $user->athlete?->academy_id;
    }
}
