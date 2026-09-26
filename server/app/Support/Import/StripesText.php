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
    /** A number, the degree sign or the ordinal indicator a Mac types, and one word. */
    private const NUMBER = '/^(\d{1,2})\s*[°º]?\s*(\p{L}+)?$/u';

    /**
     * The words a cell may name its unit with, and the count each one means.
     * `grado` / `gradi` is the import's own column name, so it fits any grade.
     *
     * @var array<string, GradeCount|null>
     */
    private const UNITS = [
        'grado' => null,
        'gradi' => null,
        'dan' => GradeCount::Dan,
        'poom' => GradeCount::Poom,
        'tacca' => GradeCount::Stripe,
        'tacche' => GradeCount::Stripe,
        'striscia' => GradeCount::Stripe,
        'strisce' => GradeCount::Stripe,
        'stripe' => GradeCount::Stripe,
        'stripes' => GradeCount::Stripe,
    ];

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
            return self::notAGrade($trimmed);
        }

        $word = mb_strtolower($match[2] ?? '');
        if ($word === 'kyu') {
            // A kyu counts down to the black belt: "2 kyu" is a colour, and
            // storing it as two tacche is a guess on someone's record.
            return StripesReading::refused("\"{$trimmed}\" is a kyu, which names the belt: write the belt's colour, and its tacche as a number.");
        }
        if ($word !== '' && ! \array_key_exists($word, self::UNITS)) {
            return self::notAGrade($trimmed);
        }

        $unit = self::UNITS[$word] ?? null;
        if ($grade !== null && $unit !== null && $unit !== $grade->count) {
            $counts = $grade->count === GradeCount::Stripe ? 'stripes' : $grade->count->value;

            return StripesReading::refused("\"{$trimmed}\" does not fit the " . self::beltName($grade) . " belt, which counts {$counts}.");
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
        $unit = $grade->count->value;
        $last = $grade->first + $grade->maxStripes;

        return 'The ' . self::beltName($grade) . " belt goes from {$grade->first}° {$unit} to {$last}° {$unit}.";
    }

    private static function notAGrade(string $cell): StripesReading
    {
        return StripesReading::refused("\"{$cell}\" is not a grade: write it as a number, like 2 or 3° dan.");
    }

    private static function beltName(Grade $grade): string
    {
        return str_replace('-', ' ', $grade->belt->value);
    }
}
