<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Support\UnpaidMonths;
use Carbon\CarbonInterface;

/**
 * The months of `$year` an athlete is late on, for the ledger's «In ritardo»
 * (#1654).
 *
 * The browser used to decide this from the rows it could see, and could not
 * see a free tier, a carnet, or an inactive status. The arrears list (#1760)
 * already knew all of that, so this asks the same two questions it does: can
 * this athlete fall behind at all (`Athlete::scopeCanFallBehind`), and which
 * months did nothing pay for (`UnpaidMonths`).
 */
class ListOverdueMonthsAction
{
    /**
     * @return list<string> `YYYY-MM`, oldest first
     */
    public function execute(Athlete $athlete, int $year, CarbonInterface $today): array
    {
        // Defensive: the foreign key guarantees an academy, static analysis
        // cannot see it. With none there is no floor, and so nothing late.
        $academy = $athlete->academy;
        if ($academy === null) {
            return [];
        }

        $canFallBehind = Athlete::query()->whereKey($athlete->id)->canFallBehind()->get();
        $months = UnpaidMonths::of($canFallBehind, $academy, $today, $year)[$athlete->id] ?? [];

        return array_map(UnpaidMonths::format(...), $months);
    }
}
