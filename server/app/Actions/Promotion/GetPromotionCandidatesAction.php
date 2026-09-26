<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Support\AthleteIdentity;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\MartialArt\RankLadder;
use Carbon\CarbonImmutable;

/**
 * The athletes who may be ready for their next step (#1841), each with the
 * facts side by side: time at the belt, since the last promotion, and the
 * training days since.
 *
 * **No score and no threshold.** Stripe policy differs between academies and
 * between coaches, so the decision stays the owner's. Every active athlete is
 * listed, the longest since their last promotion first; nobody is filtered
 * out by a rule the owner did not set.
 *
 * **The same numbers as the athlete page.** Each row is
 * {@see GetAthleteProgressionAction}'s arithmetic, called once per athlete,
 * so "eleven months at blue" here and on the card cannot disagree. That is a
 * handful of queries per athlete, against the in-process SQLite of a desktop
 * install and a roster in the tens: cheaper than a second copy of the rules
 * (whole days, distinct days, the stripe reset of a belt promotion, a stripe
 * older than the belt) that would drift from the first.
 *
 * **The last promotion** is the later of the belt and the last stripe given on
 * it; the progression already drops a stripe older than the belt. With no
 * belt row there is no "since", and the athlete comes last.
 *
 * **The next step comes from the academy's ladder**
 * ({@see RankLadder::nextStep()}). Kids' grades are offered only to a young
 * athlete in an academy that trains kids: young means not yet in any of the
 * art's adult age divisions, by the age reached this calendar year, as the
 * federations count it. An unknown date of birth reads as an adult.
 */
class GetPromotionCandidatesAction
{
    public function __construct(
        private readonly GetAthleteProgressionAction $progression,
    ) {
    }

    /**
     * @return list<array{
     *     athlete: array{id: int, first_name: string, last_name: string, belt: string, stripes: int, date_of_birth: string|null, photo_url: string|null, user_avatar_url: string|null},
     *     belt_since: string|null,
     *     months_at_belt: int|null,
     *     stripe_since: string|null,
     *     last_promoted_on: string|null,
     *     days_since_last_promotion: int|null,
     *     sessions_since_last_promotion: int|null,
     *     next: array{kind: 'stripe'|'belt', belt: string, stripes: int}|null,
     * }>
     */
    public function execute(Academy $academy): array
    {
        $profile = MartialArtProfile::for($academy->martial_art);
        $athletes = $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->with('user:id,avatar_path,updated_at')
            ->get();

        $rows = [];
        foreach ($athletes as $athlete) {
            $rows[] = $this->row($athlete, $profile, $academy->trains_kids);
        }

        usort($rows, static fn (array $a, array $b): int => [
            // Longest since the last promotion first; no belt row, last.
            $a['days_since_last_promotion'] === null,
            -($a['days_since_last_promotion'] ?? 0),
            $a['athlete']['last_name'],
            $a['athlete']['id'],
        ] <=> [
            $b['days_since_last_promotion'] === null,
            -($b['days_since_last_promotion'] ?? 0),
            $b['athlete']['last_name'],
            $b['athlete']['id'],
        ]);

        return $rows;
    }

    /**
     * @return array{
     *     athlete: array{id: int, first_name: string, last_name: string, belt: string, stripes: int, date_of_birth: string|null, photo_url: string|null, user_avatar_url: string|null},
     *     belt_since: string|null,
     *     months_at_belt: int|null,
     *     stripe_since: string|null,
     *     last_promoted_on: string|null,
     *     days_since_last_promotion: int|null,
     *     sessions_since_last_promotion: int|null,
     *     next: array{kind: 'stripe'|'belt', belt: string, stripes: int}|null,
     * }
     */
    private function row(Athlete $athlete, MartialArtProfile $profile, bool $trainsKids): array
    {
        $p = $this->progression->execute($athlete);
        $sinceStripe = $p['stripe_since'] !== null;
        $next = $profile->ladder()->nextStep(
            $athlete->belt,
            $athlete->stripes,
            $trainsKids && $this->isYoung($athlete, $profile),
        );

        return [
            'athlete' => AthleteIdentity::of($athlete),
            'belt_since' => $p['belt_since'],
            'months_at_belt' => $p['months_at_belt'],
            'stripe_since' => $p['stripe_since'],
            'last_promoted_on' => $sinceStripe ? $p['stripe_since'] : $p['belt_since'],
            'days_since_last_promotion' => $sinceStripe ? $p['days_since_stripe'] : $p['days_at_belt'],
            'sessions_since_last_promotion' => $sinceStripe ? $p['sessions_since_stripe'] : $p['sessions_at_belt'],
            'next' => $next === null ? null : [...$next, 'belt' => $next['belt']->value],
        ];
    }

    private function isYoung(Athlete $athlete, MartialArtProfile $profile): bool
    {
        if ($athlete->date_of_birth === null) {
            return false;
        }

        $age = CarbonImmutable::now()->year - $athlete->date_of_birth->year;
        foreach ($profile->ageDivisions() as $division) {
            if ($division->category === 'adults' && $division->contains($age)) {
                return false;
            }
        }

        return true;
    }
}
