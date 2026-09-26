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

    /**
     * The step after this belt and stripe count (#1841): the next stripe while
     * the grade has room for one, otherwise the next grade with its stripes
     * back to none. A dan or a poom counts as a stripe does, since the ladder
     * stores them as the grade's count.
     *
     * Kids-only grades are skipped unless the athlete is eligible for them (a
     * minor in an academy that trains kids) or already on one: an adult judoka
     * goes from white to yellow, not to the half belt, and a BJJ adult never
     * steps back into the kids' colours that open the ladder.
     *
     * @return array{kind: 'stripe'|'belt', belt: Belt, stripes: int}|null
     */
    public function nextStep(Belt $belt, int $stripes, bool $kidsEligible): ?array
    {
        $rank = $this->rankOf($belt);
        if ($rank === null) {
            return null;
        }

        $current = $this->grades[$rank - 1];
        if ($stripes < $current->maxStripes) {
            return ['kind' => 'stripe', 'belt' => $belt, 'stripes' => $stripes + 1];
        }

        $includeKids = $kidsEligible || $current->kids;
        foreach (\array_slice($this->grades, $rank) as $grade) {
            if (! $grade->kids || $includeKids) {
                return ['kind' => 'belt', 'belt' => $grade->belt, 'stripes' => 0];
            }
        }

        return null;
    }

    private function gradeOf(Belt $belt): ?Grade
    {
        $rank = $this->rankOf($belt);

        return $rank === null ? null : $this->grades[$rank - 1];
    }
}
