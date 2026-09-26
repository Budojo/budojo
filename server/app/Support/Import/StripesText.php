<?php

declare(strict_types=1);

namespace App\Support\Import;

use App\Enums\GradeCount;
use App\Support\MartialArt\Grade;

/**
 * A grade, read out of a spreadsheet cell (#1927).
 *
 * A sheet writes the grade a person holds: "3" on a judo black belt is 3° dan.
 * The ladder stores a dan without its offset (1° dan is 0, see `Grade`), so the
 * number has to come down by the grade's `first` on its way in — storing it as
 * typed put every black belt one dan too high, and refused a 5° dan outright.
 *
 * The same strictness as `BeltText`: anything that is not a number, with an
 * optional `°` and the grade's own word, is refused with a reason. It used to
 * fall back to 0, which turned "3° dan" into 1° dan — a guess, landing quietly
 * on a real person's record, which is the one thing an import must not do.
 */
final class StripesText
{
    private const NUMBER = '/^(\d{1,2})\s*°?\s*(dan|poom|kyu|gradi|grado|strisce|tacche)?$/iu';

    /**
     * @param Grade|null $grade the grade of the row's belt, or null when the belt
     *                          is not on the ladder — then the number is taken
     *                          as it is, and the belt's own error explains the row
     */
    public static function parse(string $text, ?Grade $grade): StripesReading
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return StripesReading::of(0);
        }

        if (preg_match(self::NUMBER, $trimmed, $match) !== 1) {
            return StripesReading::refused("\"{$trimmed}\" is not a grade: write it as a number, like 2 or 3° dan.");
        }

        $number = (int) $match[1];
        // Stripes are stored as counted, and `StripesWithinGrade` caps them in
        // the same words the form uses. Only a dan or a poom needs its offset
        // taken off — and its own refusal, since "at most 4 stripes" is not
        // how anyone describes a 5° dan black belt.
        if ($grade === null || $grade->count === GradeCount::Stripe) {
            return StripesReading::of($number);
        }

        $stored = $number - $grade->first;
        if ($stored < 0 || $stored > $grade->maxStripes) {
            return StripesReading::refused(self::outOfRange($grade));
        }

        return StripesReading::of($stored);
    }

    /** "The black belt goes from 1° dan to 5° dan." — in the grade's own words. */
    private static function outOfRange(Grade $grade): string
    {
        $belt = str_replace('-', ' ', $grade->belt->value);
        $unit = $grade->count->value;
        $last = $grade->first + $grade->maxStripes;

        return "The {$belt} belt goes from {$grade->first}° {$unit} to {$last}° {$unit}.";
    }
}
