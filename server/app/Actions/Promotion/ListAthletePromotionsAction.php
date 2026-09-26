<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Enums\MartialArt;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\Promotion\PromotionOrder;
use App\Support\Promotion\PromotionRecord;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Pagination\Paginator;

/**
 * One page of an athlete's promotion timeline, newest first (#1966).
 *
 * Newest first in exactly the reverse of the order the gaps are replayed in
 * ({@see PromotionOrder}), so a ghost row always sits between the rows its
 * window names. `recorded_at DESC, id DESC` alone cannot say it: since #1963
 * every row of a day shares the owner's midnight, and a step filled on the
 * day of the row after it is written later — a higher id — but happened
 * before it.
 *
 * The whole history is read and paged in PHP: one athlete's timeline is tens
 * of rows, and the order is the ladder's, which SQL does not know.
 */
class ListAthletePromotionsAction
{
    public const PER_PAGE = 20;

    /**
     * @return LengthAwarePaginator<int, AthletePromotion>
     */
    public function execute(Athlete $athlete, int $page): LengthAwarePaginator
    {
        $rows = $athlete->promotions()->with('recordedBy:id,first_name,last_name')->get()->keyBy('id');
        $ladder = MartialArtProfile::for($athlete->academy->martial_art ?? MartialArt::Bjj)->ladder();

        $records = array_values($rows->map(PromotionRecord::of(...))->all());
        $newestFirst = array_reverse(new PromotionOrder($ladder)->chronological($records));
        $ordered = [];
        foreach ($newestFirst as $record) {
            $row = $rows->get($record->id);
            \assert($row instanceof AthletePromotion); // every record was read from these rows
            $ordered[] = $row;
        }

        return new LengthAwarePaginator(
            \array_slice($ordered, ($page - 1) * self::PER_PAGE, self::PER_PAGE),
            \count($ordered),
            self::PER_PAGE,
            $page,
            ['path' => Paginator::resolveCurrentPath()],
        );
    }
}
