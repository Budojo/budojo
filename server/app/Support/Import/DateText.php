<?php

declare(strict_types=1);

namespace App\Support\Import;

use Carbon\CarbonImmutable;

/**
 * A date, read out of a spreadsheet cell (#1346).
 *
 * Deliberately not `strtotime` or `Carbon::parse`. Both accept almost
 * anything and resolve `03/04/2019` by American convention, which silently
 * moves a birthday from 3 April to 4 March — and silently is the problem: the
 * import would report a clean success and the record would be wrong.
 *
 * So the accepted shapes are enumerated, `d/m/Y` wins over `m/d/Y`, and
 * anything outside the list comes back `null` for the row to be reported.
 *
 * The genuinely ambiguous case cannot be solved by parsing harder — nothing
 * in `03/04/2019` says which convention wrote it. It is solved by the import
 * being a **two-step flow**: the preview shows the parsed date, in full, before
 * a single row is written. The rule here only has to be fixed and stated; the
 * screen is what makes it checkable.
 */
final class DateText
{
    /**
     * In precedence order. `!` resets the unparsed fields to the epoch, so a
     * cell carrying only a date does not inherit today's clock — otherwise two
     * runs of the same file produce different values.
     *
     * @var list<string>
     */
    private const FORMATS = [
        '!d/m/Y',
        '!d-m-Y',
        '!d.m.Y',
        '!d m Y',
        '!Y-m-d',
        '!Y/m/d',
        '!d/m/y',
        '!d-m-y',
        '!d.m.y',
    ];

    public static function parse(?string $text): ?CarbonImmutable
    {
        $trimmed = trim($text ?? '');
        if ($trimmed === '') {
            return null;
        }

        // An export commonly writes `15/03/2019 00:00:00`. The time carries no
        // information for a date column, and keeping it would make the format
        // list twice as long for nothing.
        $dateOnly = trim((string) preg_replace('/\s+\d{1,2}:\d{2}(:\d{2})?$/', '', $trimmed));

        foreach (self::FORMATS as $format) {
            $parsed = self::tryFormat($format, $dateOnly);
            if ($parsed !== null) {
                return $parsed;
            }
        }

        return null;
    }

    /**
     * A format either matches exactly or does not count. Two traps here, both
     * paid for:
     *
     * 1. **Carbon throws.** `rawCreateFromFormat` is not
     *    `DateTime::createFromFormat` — a mismatch raises
     *    `InvalidFormatException` rather than returning `false`, so trying a
     *    list of formats without catching means the FIRST wrong guess ends the
     *    whole attempt.
     * 2. **A wrong date does not throw at all.** `31/02/2019` parses happily
     *    and rolls over to 3 March, reporting it only as a *warning*. A
     *    birthday that silently moves is far worse than a row that comes back
     *    with a reason, so a warning is treated as a refusal.
     */
    private static function tryFormat(string $format, string $text): ?CarbonImmutable
    {
        try {
            $parsed = CarbonImmutable::rawCreateFromFormat($format, $text);
        } catch (\Throwable) {
            return null;
        }

        if ($parsed === null) {
            return null;
        }

        $errors = CarbonImmutable::getLastErrors();
        if (\is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
            return null;
        }

        // The third trap, and the quietest. `!d/m/Y` reads `15/03/19` as the
        // year **19 AD** — no exception, no warning, and it matches before
        // `!d/m/y` is ever tried, so a spreadsheet's two-digit year would land
        // as a first-century date. Rejecting an implausible year is what sends
        // it on to the next format, and it costs nothing that a real athlete
        // could ever need: nobody in this table was born before 1900.
        return $parsed->year >= 1900 && $parsed->year <= 2999 ? $parsed : null;
    }
}
