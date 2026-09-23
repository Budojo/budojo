<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;

/**
 * The belts a martial art awards, in rank order, with the stripe cap of each
 * (#1800).
 *
 * The single source of truth for "by belt rank" — the roster sort, the stripe
 * validators and the self-enrolment default all ask it. It replaced
 * `Belt::rank()` and `Belt::maxStripes()`, which could only ever describe one
 * art: blue is 6th of 12 in BJJ and 7th of 12 in taekwondo.
 */
final class RankLadder
{
    /**
     * How many grades the roster's belt sort has room for. The SQL is a
     * literal with this many placeholders — `orderByRaw()` takes a
     * `literal-string`, so it cannot be generated from a ladder — and the
     * registry guard keeps every ladder inside it.
     */
    public const int MAX_GRADES = 16;

    /** @var array<string, int> belt value → 1-based rank */
    private readonly array $ranks;

    /**
     * @param list<Grade> $grades in rank order, lowest first
     */
    public function __construct(private readonly array $grades)
    {
        if ($grades === [] || \count($grades) > self::MAX_GRADES) {
            throw new \InvalidArgumentException(\sprintf('A ladder holds 1 to %d grades.', self::MAX_GRADES));
        }

        $ranks = [];
        foreach ($grades as $index => $grade) {
            if (isset($ranks[$grade->belt->value])) {
                throw new \InvalidArgumentException("The {$grade->belt->value} belt appears twice in one ladder.");
            }
            $ranks[$grade->belt->value] = $index + 1;
        }
        $this->ranks = $ranks;
    }

    /** @return list<Grade> */
    public function grades(): array
    {
        return $this->grades;
    }

    /** @return list<Belt> */
    public function belts(): array
    {
        return array_map(static fn (Grade $grade): Belt => $grade->belt, $this->grades);
    }

    public function has(Belt $belt): bool
    {
        return isset($this->ranks[$belt->value]);
    }

    /** Null for a colour this art does not award. */
    public function rankOf(Belt $belt): ?int
    {
        return $this->ranks[$belt->value] ?? null;
    }

    /** Null for a colour this art does not award — the belt rule reports that. */
    public function maxStripes(Belt $belt): ?int
    {
        return $this->gradeOf($belt)?->maxStripes;
    }

    /**
     * The belt an adult starts on: the lowest grade that is not a children's
     * step. Not simply the first rung — BJJ's ladder opens with the kids'
     * grey, and nobody enrolling themselves as an adult is a grey belt.
     */
    public function startingBelt(): Belt
    {
        foreach ($this->grades as $grade) {
            if (! $grade->kids) {
                return $grade->belt;
            }
        }

        return $this->grades[0]->belt;
    }

    /**
     * The values for the roster's belt-sort `CASE`, in rank order, padded to
     * `MAX_GRADES` with nulls. A null never matches (`belt = NULL` is not
     * true), so the unused `WHEN` branches are inert.
     *
     * @return list<string|null>
     */
    public function sortBindings(): array
    {
        $values = array_map(static fn (Grade $grade): string => $grade->belt->value, $this->grades);

        return array_pad($values, self::MAX_GRADES, null);
    }

    private function gradeOf(Belt $belt): ?Grade
    {
        $rank = $this->rankOf($belt);

        return $rank === null ? null : $this->grades[$rank - 1];
    }
}
