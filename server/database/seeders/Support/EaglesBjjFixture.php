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
     * @param  array{
     *     line1: string,
     *     line2: string|null,
     *     city: string,
     *     postal_code: string,
     *     province: string,
     *     country: string
     * }|null $academyAddress  Structured address (#72), or null when the fixture omits it.
     */
    public function __construct(
        public string $academyName,
        public ?array $academyAddress,
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
        if (! \is_string($name)) {
            throw new \InvalidArgumentException('Eagles BJJ academy fixture must have string "name".');
        }

        $rawAddress = $academy['address'] ?? null;
        $address = self::parseAddress($rawAddress);

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
        if (! \is_array($trainingDays) || ! \array_is_list($trainingDays)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing list "training_days_of_week".');
        }
        /** @var list<int> $trainingDaysList */
        $trainingDaysList = [];
        foreach ($trainingDays as $day) {
            if (! \is_int($day)) {
                throw new \InvalidArgumentException('Eagles BJJ training_days_of_week entries must be ints.');
            }
            // Carbon dayOfWeek is 0..6 (Sunday..Saturday). Out-of-range
            // values silently produce zero matches inside eachTrainingDay()
            // — fail fast with a clear message instead of a quiet empty seed.
            if ($day < 0 || $day > 6) {
                throw new \InvalidArgumentException(
                    "Eagles BJJ training_days_of_week entries must be in 0..6 (Carbon::SUNDAY..Carbon::SATURDAY), got {$day}.",
                );
            }
            $trainingDaysList[] = $day;
        }

        $window = $attendance['simulation_window_days'] ?? null;
        if (! \is_int($window)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing int "simulation_window_days".');
        }
        if ($window < 0) {
            throw new \InvalidArgumentException(
                "Eagles BJJ attendance fixture 'simulation_window_days' must be >= 0, got {$window}.",
            );
        }

        $defaultProbability = $attendance['default_probability'] ?? null;
        if (! \is_int($defaultProbability) && ! \is_float($defaultProbability)) {
            throw new \InvalidArgumentException('Eagles BJJ attendance fixture missing numeric "default_probability".');
        }
        $defaultProbability = (float) $defaultProbability;
        if ($defaultProbability < 0.0 || $defaultProbability > 1.0) {
            throw new \InvalidArgumentException(
                "Eagles BJJ attendance fixture 'default_probability' must be in [0, 1], got {$defaultProbability}.",
            );
        }

        return new self(
            academyName: $name,
            academyAddress: $address,
            athletes: $athleteFixtures,
            trainingDaysOfWeek: $trainingDaysList,
            simulationWindowDays: $window,
            defaultProbability: $defaultProbability,
        );
    }

    /**
     * Parse the structured address fixture (#72) into a typed array shape
     * the seeder can hand to `SyncAcademyAddressAction` verbatim. `null`
     * means "no address on file" — both legal at fixture level and rendered
     * as a missing morph row at seed time.
     *
     * @return array{
     *     line1: string,
     *     line2: string|null,
     *     city: string,
     *     postal_code: string,
     *     province: string,
     *     country: string
     * }|null
     */
    private static function parseAddress(mixed $raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        if (! \is_array($raw)) {
            throw new \InvalidArgumentException(
                'Eagles BJJ academy "address" must be an array of structured fields or null (#72 dropped the freeform string shape).',
            );
        }

        $line1 = $raw['line1'] ?? null;
        $city = $raw['city'] ?? null;
        $postalCode = $raw['postal_code'] ?? null;
        $province = $raw['province'] ?? null;
        $country = $raw['country'] ?? null;
        $line2 = $raw['line2'] ?? null;

        if (! \is_string($line1) || ! \is_string($city) || ! \is_string($postalCode)
            || ! \is_string($province) || ! \is_string($country)) {
            throw new \InvalidArgumentException(
                'Eagles BJJ academy address must include strings line1, city, postal_code, province, country.',
            );
        }
        if ($line2 !== null && ! \is_string($line2)) {
            throw new \InvalidArgumentException('Eagles BJJ academy address line2 must be string|null.');
        }

        return [
            'line1' => $line1,
            'line2' => $line2,
            'city' => $city,
            'postal_code' => $postalCode,
            'province' => $province,
            'country' => $country,
        ];
    }
}
