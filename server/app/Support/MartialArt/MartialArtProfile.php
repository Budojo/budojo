<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;
use App\Enums\GradeCount;
use App\Enums\MartialArt;
use App\Enums\TrainingMode;

/**
 * Everything the app knows about a martial art that is not the academy's own
 * data (#1800): its ladder, its two training modes (#1803), its starter
 * programmes and its federation's age divisions (#1807).
 *
 * Read from `database/seed-data/martial-arts/<art>.json`, one file per
 * `MartialArt` case, and cached per process — the files ship with the app and
 * never change under it. Parsed strictly: a malformed registry is a build
 * defect, and the guard test reads every file through this same code, so a
 * typo fails CI instead of a roster.
 *
 * `Support`, not `Actions`: a dependency-free helper several use cases read
 * (`server/CLAUDE.md` § escape hatches). No Eloquent, no HTTP.
 */
final class MartialArtProfile
{
    public const string REGISTRY_DIR = 'seed-data/martial-arts';

    public const string PROGRAMME_DIR = 'seed-data/syllabus';

    /** @var array<string, self> */
    private static array $loaded = [];

    /**
     * @param array{TrainingMode, TrainingMode} $trainingModes
     * @param array<string, string>             $programmes    key → file name under PROGRAMME_DIR, in offer order
     * @param list<AgeDivision>                 $ageDivisions  youngest first
     */
    private function __construct(
        public readonly MartialArt $art,
        private readonly RankLadder $ladder,
        private readonly array $trainingModes,
        private readonly array $programmes,
        private readonly array $ageDivisions,
    ) {
    }

    public static function for(MartialArt $art): self
    {
        return self::$loaded[$art->value] ??= self::load($art);
    }

    public function ladder(): RankLadder
    {
        return $this->ladder;
    }

    /**
     * The art's two training modes, in the order its pickers list them — gi
     * then no-gi, kata then kumite.
     *
     * @return array{TrainingMode, TrainingMode}
     */
    public function trainingModes(): array
    {
        return $this->trainingModes;
    }

    /**
     * What a topic of this art may be trained in: its two modes and `both`.
     *
     * @return list<TrainingMode>
     */
    public function topicModes(): array
    {
        return [...$this->trainingModes, TrainingMode::Both];
    }

    /**
     * What a class of this art may be: a topic's modes, and `other` for what
     * is on the timetable without being the art.
     *
     * @return list<TrainingMode>
     */
    public function classModes(): array
    {
        return [...$this->topicModes(), TrainingMode::Other];
    }

    /**
     * The federation's age divisions, youngest first, contiguous, the last
     * one open-ended — what the stats page buckets athletes into.
     *
     * @return list<AgeDivision>
     */
    public function ageDivisions(): array
    {
        return $this->ageDivisions;
    }

    /**
     * The starter programmes this art offers, by key, in the order the
     * programme page lists them. Empty until the first one ships — the seed
     * endpoint then answers 404 and the page offers no button.
     *
     * @return list<string>
     */
    public function programmes(): array
    {
        return array_keys($this->programmes);
    }

    /** Absolute path of a programme file, or null when this art does not offer the key. */
    public function programmeFile(string $key): ?string
    {
        $file = $this->programmes[$key] ?? null;

        return $file === null ? null : database_path(self::PROGRAMME_DIR . '/' . $file);
    }

    private static function load(MartialArt $art): self
    {
        $path = database_path(self::REGISTRY_DIR . '/' . $art->value . '.json');
        $raw = @file_get_contents($path);
        if ($raw === false) {
            throw new \RuntimeException("The {$art->value} registry could not be read.");
        }

        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (! \is_array($data) || ($data['martial_art'] ?? null) !== $art->value) {
            throw new \RuntimeException("The {$art->value} registry does not describe {$art->value}.");
        }

        return new self(
            $art,
            self::ladderFrom($art, $data['grades'] ?? null),
            self::trainingModesFrom($art, $data['training_modes'] ?? null),
            self::programmesFrom($art, $data['programmes'] ?? null),
            self::ageDivisionsFrom($art, \is_array($data['age_divisions'] ?? null) ? ($data['age_divisions']['divisions'] ?? null) : null),
        );
    }

    private static function ladderFrom(MartialArt $art, mixed $grades): RankLadder
    {
        if (! \is_array($grades)) {
            throw new \RuntimeException("The {$art->value} registry has no grades.");
        }

        $parsed = [];
        foreach ($grades as $grade) {
            $belt = \is_array($grade) && \is_string($grade['belt'] ?? null) ? Belt::tryFrom($grade['belt']) : null;
            $max = \is_array($grade) ? ($grade['max_stripes'] ?? null) : null;
            if ($belt === null || ! \is_int($max) || $max < 0 || $max > 10) {
                throw new \RuntimeException("The {$art->value} registry has a grade that is not a known belt with a 0-10 stripe cap.");
            }

            $count = GradeCount::tryFrom(\is_string($grade['count'] ?? null) ? $grade['count'] : GradeCount::Stripe->value);
            $first = $grade['first'] ?? 0;
            if ($count === null || ! \is_int($first) || $first < 0) {
                throw new \RuntimeException("The {$art->value} registry misdescribes what a stripe on {$belt->value} counts.");
            }

            $parsed[] = new Grade($belt, $max, $count, $first, ($grade['kids'] ?? false) === true);
        }

        return new RankLadder($parsed);
    }

    /**
     * Exactly two, distinct, and neither of them the middle: `both` and
     * `other` belong to every art and are added by {@see topicModes()} and
     * {@see classModes()}, so a registry that lists one is misdescribing the
     * split.
     *
     * @return array{TrainingMode, TrainingMode}
     */
    private static function trainingModesFrom(MartialArt $art, mixed $modes): array
    {
        $parsed = \is_array($modes) && array_is_list($modes)
            ? array_map(static fn (mixed $mode): ?TrainingMode => \is_string($mode) ? TrainingMode::tryFrom($mode) : null, $modes)
            : [];

        [$a, $b] = [$parsed[0] ?? null, $parsed[1] ?? null];
        if (\count($parsed) !== 2 || $a === null || $b === null || $a === $b
            || \in_array(TrainingMode::Both, $parsed, true) || \in_array(TrainingMode::Other, $parsed, true)) {
            throw new \RuntimeException("The {$art->value} registry must name exactly two training modes, neither of them both or other.");
        }

        return [$a, $b];
    }

    /**
     * Youngest first, each starting the year after the last one ends, and
     * only the last open-ended: a gap would drop athletes from the chart
     * without a word, and an overlap would count one athlete twice.
     *
     * @return list<AgeDivision>
     */
    private static function ageDivisionsFrom(MartialArt $art, mixed $divisions): array
    {
        if (! \is_array($divisions) || $divisions === []) {
            throw new \RuntimeException("The {$art->value} registry has no age divisions.");
        }

        $parsed = [];
        $seen = [];
        $next = null;
        foreach (array_values($divisions) as $index => $division) {
            $code = \is_array($division) ? ($division['code'] ?? null) : null;
            $category = \is_array($division) ? ($division['category'] ?? null) : null;
            $min = \is_array($division) ? ($division['min'] ?? null) : null;
            $max = \is_array($division) ? ($division['max'] ?? null) : null;
            $isLast = $index === \count($divisions) - 1;

            // A repeated code would share one counter between two age ranges
            // and draw both in each bar.
            $valid = \is_string($code) && preg_match('/^[a-z][a-z0-9_]*$/', $code) === 1 && ! isset($seen[$code])
                && ($category === 'kids' || $category === 'adults')
                && \is_int($min) && $min >= 0 && ($next === null || $min === $next)
                && ($isLast ? $max === null : \is_int($max) && $max >= $min);
            if (! $valid) {
                throw new \RuntimeException("The {$art->value} registry has an age division that is not uniquely named, contiguous, ascending and open only at the top.");
            }

            /** @var string $code */
            /** @var 'kids'|'adults' $category */
            /** @var int $min */
            /** @var int|null $max */
            $parsed[] = new AgeDivision($code, $category, $min, $max);
            $seen[$code] = true;
            $next = $max === null ? null : $max + 1;
        }

        return $parsed;
    }

    /**
     * @return array<string, string>
     */
    private static function programmesFrom(MartialArt $art, mixed $programmes): array
    {
        if (! \is_array($programmes)) {
            throw new \RuntimeException("The {$art->value} registry has no programmes list.");
        }

        $parsed = [];
        foreach ($programmes as $programme) {
            $key = \is_array($programme) ? ($programme['key'] ?? null) : null;
            $file = \is_array($programme) ? ($programme['file'] ?? null) : null;
            if (! \is_string($key) || $key === '' || ! \is_string($file) || $file === '' || isset($parsed[$key])) {
                throw new \RuntimeException("The {$art->value} registry lists a programme without a unique key and a file.");
            }
            $parsed[$key] = $file;
        }

        return $parsed;
    }
}
