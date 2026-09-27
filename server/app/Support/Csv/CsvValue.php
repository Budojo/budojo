<?php

declare(strict_types=1);

namespace App\Support\Csv;

use Carbon\CarbonInterface;

/**
 * Values the way the reader of a {@see CsvWriter} file reads them: an Italian
 * Excel, which parses `03/09/2026` as 3 September and `165,00` as a number.
 * A decimal point would be worse than useless there — Italian Excel reads the
 * dot as a thousands separator, and `165.00` becomes sixteen thousand five
 * hundred.
 */
final class CsvValue
{
    /** `03/09/2026`: day first, as an Italian reads it and Excel parses it. */
    public static function date(CarbonInterface $date): string
    {
        return $date->format('d/m/Y');
    }

    /**
     * Cents as an amount with a decimal comma: `16500` → `165,00`.
     *
     * Integer arithmetic to the last step, so no float is ever made: cents
     * are the unit everywhere else in the app, and this is the one boundary
     * where they turn into text.
     */
    public static function money(int $cents): string
    {
        return \sprintf('%d,%02d', intdiv($cents, 100), $cents % 100);
    }
}
