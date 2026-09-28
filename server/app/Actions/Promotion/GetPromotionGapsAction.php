<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\AthletePromotionSkip;
use App\Support\MartialArt\KidsEligibility;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\OperatorDay;
use App\Support\Promotion\EntryPlaceholder;
use App\Support\Promotion\PromotionGaps;
use App\Support\Promotion\PromotionRecord;
use Carbon\CarbonImmutable;

/**
 * The steps missing from an athlete's promotion history (#1966), over the
 * whole of it — the timeline is paged, the gaps are not.
 *
 * Read against the athlete's academy's ladder, with the kids' rule "Chi
 * promuovere?" uses ({@see KidsEligibility}) asked about the belt and the day
 * of each stretch, and minus the steps the owner said never happened — which
 * are listed apart, to be brought back (#1989).
 *
 * @phpstan-import-type Gap from PromotionGaps
 * @phpstan-import-type Skipped from PromotionGaps
 */
class GetPromotionGapsAction
{
    /**
     * @return array{gaps: list<Gap>, skipped: list<Skipped>, history_starts_at: string|null}
     */
    public function execute(Athlete $athlete): array
    {
        $academy = $athlete->academy;
        $profile = MartialArtProfile::for($academy->martial_art ?? MartialArt::Bjj);
        $trainsKids = $academy->trains_kids ?? false;
        // The owner's day (#1963): at 23:30 UTC a gap after a row dated
        // their today would otherwise have no day left in its window.
        $today = OperatorDay::today();

        $finder = new PromotionGaps(
            $profile->ladder(),
            static fn (Belt $belt, CarbonImmutable $on): bool => KidsEligibility::of($athlete, $profile, $trainsKids, $belt, $on),
            $today,
        );

        return $finder->find(
            array_values($athlete->promotions()->reorder()->get()
                ->map(static fn (AthletePromotion $promotion): PromotionRecord => PromotionRecord::of($promotion, EntryPlaceholder::is($promotion, $athlete)))
                ->all()),
            $athlete->belt,
            $athlete->stripes,
            $this->skipped($athlete),
        );
    }

    /** @return list<string> */
    private function skipped(Athlete $athlete): array
    {
        return array_values($athlete->promotionSkips()->get()
            ->map(static fn (AthletePromotionSkip $skip): string => "{$skip->belt->value}:{$skip->stripes}")
            ->all());
    }
}
