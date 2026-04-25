<?php

declare(strict_types=1);

namespace Database\Seeders\Support;

/**
 * Typed wrapper around the Eagles BJJ fixture .php file. Replaces the inline
 * array<...> shape annotation that EaglesBjjSeeder::fixture() used to carry —
 * 30+ lines of doc-block per consumer — with a single value object whose
 * named properties communicate the contract at the type level.
 *
 * Strategy: the on-disk fixture stays a plain PHP array (so the maintainer
 * can edit `eagles-bjj.local.php` without bringing in PHP class noise), and
 * `fromArray()` validates + materialises it into this DTO. Consumers iterate
 * `$fixture->athletes` instead of `$data['athletes']`, and PHPStan + the
 * editor know every accessor's type.
 */
final readonly class EaglesBjjFixture
{
    /**
     * @param  list<EaglesBjjAthleteFixture>  $athletes
     * @param  list<int>                      $trainingDaysOfWeek  Carbon dayOfWeek constants (0=Sun … 6=Sat)
     */
    public function __construct(
        public string $academyName,
        public string $academyAddress,
        public array $athletes,
        public array $trainingDaysOfWeek,
        public int $simulationWindowDays,
        public float $defaultProbability,
    ) {
    }

    /**
     * Reads the fixture from `seed-data/eagles-bjj.local.php` if present,
     * falls back to `seed-data/eagles-bjj.example.php` otherwise — same
     * pattern as `.env` / `.env.example`.
     */
    public static function fromDefaultFile(): self
    {
        $base = database_path('seed-data/eagles-bjj');
        $path = is_file("{$base}.local.php") ? "{$base}.local.php" : "{$base}.example.php";

        /** @var mixed $raw */
        $raw = require $path;
        if (! \is_array($raw)) {
            throw new \InvalidArgumentException("Eagles BJJ fixture at {$path} must return an array.");
        }

        return self::fromArray($raw);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $academy = $data['academy'] ?? null;
        if (! \is_array($academy)) {
            throw new \InvalidArgumentException('Eagles BJJ fixture missing array "academy".');
        }
        $name = $academy['name'] ?? null;
        $address = $academy['address'] ?? null;
        if (! \is_string($name) || ! \is_string($address)) {
            throw new \InvalidArgumentException('Eagles BJJ academy fixture must have string name + address.');
        }

        $athletes = $data['athletes'] ?? null;
        if (! \is_array($athletes)) {
            throw new \InvalidArgumentException('Eagles BJJ fixture missing array "athletes".');
        }

        /** @var list<EaglesBjjAthleteFixture> $athleteFixtures */
        $athleteFixtures = [];
        foreach ($athletes as $row) {
            if (! \is_array($row)) {
                throw new \InvalidArgumentException('Eagles BJJ athletes entries must each be an array.');
            }
            /** @var array<string, mixed> $row */
            $athleteFixtures[] = EaglesBjjAthleteFixture::fromArray($row);
        }

        $attendance = $data['attendance'] ?? null;
        if (! \is_array($attendance)) {
            throw new \InvalidArgumentException('Eagles BJJ fixture missing array "attendance".');
        }

        $trainingDays = $attendance['training_days_of_week'] ?? null;
        if (! \is_array($trainingDays)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing list "training_days_of_week".');
        }
        /** @var list<int> $trainingDaysList */
        $trainingDaysList = [];
        foreach ($trainingDays as $day) {
            if (! \is_int($day)) {
                throw new \InvalidArgumentException('Eagles BJJ training_days_of_week entries must be ints.');
            }
            $trainingDaysList[] = $day;
        }

        $window = $attendance['simulation_window_days'] ?? null;
        if (! \is_int($window)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing int "simulation_window_days".');
        }

        $defaultProbability = $attendance['default_probability'] ?? null;
        if (! \is_int($defaultProbability) && ! \is_float($defaultProbability)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing numeric "default_probability".');
        }

        return new self(
            academyName: $name,
            academyAddress: $address,
            athletes: $athleteFixtures,
            trainingDaysOfWeek: $trainingDaysList,
            simulationWindowDays: $window,
            defaultProbability: (float) $defaultProbability,
        );
    }
}
