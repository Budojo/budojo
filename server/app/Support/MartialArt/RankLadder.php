<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;
use App\Enums\GradeCount;

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
     * Grades come in the order people climb them ({@see self::climbingOrder()}),
     * and kids-only grades are skipped unless the athlete is eligible for them:
     * an adult judoka goes from white to yellow, not to the half belt, and a
     * sixteen-year-old BJJ orange belt goes to blue, with or without stripes
     * left on the orange. A poom leads to the dan of its own number. Who is
     * eligible is the caller's to decide; the ladder knows grades, not ages.
     *
     * @return array{kind: 'stripe'|'belt', belt: Belt, stripes: int}|null
     */
    public function nextStep(Belt $belt, int $stripes, bool $kidsEligible): ?array
    {
        $current = $this->gradeOf($belt);
        if ($current === null) {
            return null;
        }

        // Someone who has outgrown a kids' grade moves on whatever its stripes:
        // no more of them, and no more of its colours.
        $outgrown = $current->kids && ! $kidsEligible;
        if ($stripes < $current->maxStripes && ! $outgrown) {
            return ['kind' => 'stripe', 'belt' => $belt, 'stripes' => $stripes + 1];
        }

        $order = $this->climbingOrder();
        $position = array_search($current, $order, true);
        \assert(\is_int($position));
        foreach (\array_slice($order, $position + 1) as $grade) {
            if (! $grade->kids || $kidsEligible) {
                return ['kind' => 'belt', 'belt' => $grade->belt, 'stripes' => self::degreesCarried($current, $stripes, $grade)];
            }
        }

        return null;
    }

    /** Whether this belt is a children's step (#1651). False for a colour this art does not award. */
    public function isKidsGrade(Belt $belt): bool
    {
        return $this->gradeOf($belt)?->kids === true;
    }

    /**
     * The count a new grade opens on: none, except that a poom becomes the
     * dan of the same number (Kukkiwon, at fifteen), so 2nd poom leads to 2nd
     * dan and not back to the 1st.
     */
    private static function degreesCarried(Grade $from, int $stripes, Grade $to): int
    {
        if ($from->count !== GradeCount::Poom || $to->count !== GradeCount::Dan) {
            return 0;
        }

        return max(0, min($to->maxStripes, $from->first + $stripes - $to->first));
    }

    /**
     * The grades in the order people climb them, which is not always rank
     * order. BJJ ranks its kids' grades (grey to green) below white, so the
     * roster sorts a child below an adult beginner; but a child starts on
     * white and climbs them from there, and green leads on to blue. So the
     * starting belt comes first, then any kids' grades ranked below it, then
     * the rest. For a ladder that opens on its starting belt (judo, karate,
     * taekwondo) this is rank order.
     *
     * @return list<Grade>
     */
    private function climbingOrder(): array
    {
        $start = $this->rankOf($this->startingBelt());
        \assert($start !== null);

        return [
            $this->grades[$start - 1],
            ...\array_slice($this->grades, 0, $start - 1),
            ...\array_slice($this->grades, $start),
        ];
    }

    private function gradeOf(Belt $belt): ?Grade
    {
        $rank = $this->rankOf($belt);

        return $rank === null ? null : $this->grades[$rank - 1];
    }
}
