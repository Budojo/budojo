<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;
use App\Enums\GradeCount;
use App\Enums\MartialArt;

/**
 * Everything the app knows about a martial art that is not the academy's own
 * data (#1800): its ladder and its starter programmes.
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
     * @param array<string, string> $programmes key → file name under PROGRAMME_DIR, in offer order
     */
    private function __construct(
        public readonly MartialArt $art,
        private readonly RankLadder $ladder,
        private readonly array $programmes,
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

        return new self($art, self::ladderFrom($art, $data['grades'] ?? null), self::programmesFrom($art, $data['programmes'] ?? null));
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
