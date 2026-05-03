<?php

declare(strict_types=1);

namespace Database\Seeders\Support;

/**
 * Typed wrapper around the Demo Academy fixture .php file. Replaces the inline
 * array<...> shape annotation that DemoAcademySeeder::fixture() used to carry —
 * 30+ lines of doc-block per consumer — with a single value object whose
 * named properties communicate the contract at the type level.
 *
 * Strategy: the on-disk fixture stays a plain PHP array (so the maintainer
 * can edit `demo-academy.local.php` without bringing in PHP class noise), and
 * `fromArray()` validates + materialises it into this DTO. Consumers iterate
 * `$fixture->athletes` instead of `$data['athletes']`, and PHPStan + the
 * editor know every accessor's type.
 */
final readonly class DemoAcademyFixture
{
    /**
     * @param  list<DemoAcademyAthleteFixture>  $athletes
     * @param  list<int>                        $trainingDaysOfWeek  Carbon dayOfWeek constants (0=Sun … 6=Sat)
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
        public ?int $academyMonthlyFeeCents,
        public array $athletes,
        public array $trainingDaysOfWeek,
        public int $simulationWindowDays,
        public float $defaultProbability,
    ) {
    }

    /**
     * Reads the fixture from `seed-data/demo-academy.local.php` if present,
     * falls back to `seed-data/demo-academy.example.php` otherwise — same
     * pattern as `.env` / `.env.example`.
     */
    public static function fromDefaultFile(): self
    {
        $base = database_path('seed-data/demo-academy');
        $path = is_file("{$base}.local.php") ? "{$base}.local.php" : "{$base}.example.php";

        /** @var mixed $raw */
        $raw = require $path;
        if (! \is_array($raw)) {
            throw new \InvalidArgumentException("Demo Academy fixture at {$path} must return an array.");
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
            throw new \InvalidArgumentException('Demo Academy fixture missing array "academy".');
        }
        $name = $academy['name'] ?? null;
        if (! \is_string($name)) {
            throw new \InvalidArgumentException('Demo Academy academy fixture must have string "name".');
        }

        $rawAddress = $academy['address'] ?? null;
        $address = self::parseAddress($rawAddress);

        // monthly_fee_cents is optional at fixture level — older fixtures and
        // tests omit it; the seeder treats `null` as "do not set on the
        // Academy row". When present it must be a non-negative int.
        $monthlyFeeCents = $academy['monthly_fee_cents'] ?? null;
        if ($monthlyFeeCents !== null) {
            if (! \is_int($monthlyFeeCents)) {
                throw new \InvalidArgumentException('Demo Academy academy fixture "monthly_fee_cents" must be int|null.');
            }
            if ($monthlyFeeCents < 0) {
                throw new \InvalidArgumentException(
                    "Demo Academy academy fixture 'monthly_fee_cents' must be >= 0, got {$monthlyFeeCents}.",
                );
            }
        }

        $athletes = $data['athletes'] ?? null;
        if (! \is_array($athletes)) {
            throw new \InvalidArgumentException('Demo Academy fixture missing array "athletes".');
        }

        /** @var list<DemoAcademyAthleteFixture> $athleteFixtures */
        $athleteFixtures = [];
        foreach ($athletes as $row) {
            if (! \is_array($row)) {
                throw new \InvalidArgumentException('Demo Academy athletes entries must each be an array.');
            }
            /** @var array<string, mixed> $row */
            $athleteFixtures[] = DemoAcademyAthleteFixture::fromArray($row);
        }

        // The training schedule lives under `attendance.training_days_of_week`
        // historically; the academy row mirrors it via the optional
        // `academy.training_days_of_week` key (same contract). When both are
        // present we trust the academy key (the new shape) — it's the source
        // of truth that the seeder writes to `academies.training_days`. The
        // attendance simulator falls back to whichever exists.
        $attendance = $data['attendance'] ?? null;
        if (! \is_array($attendance)) {
            throw new \InvalidArgumentException('Demo Academy fixture missing array "attendance".');
        }

        $trainingDaysList = self::parseTrainingDays(
            $academy['training_days_of_week'] ?? $attendance['training_days_of_week'] ?? null,
        );

        $window = $attendance['simulation_window_days'] ?? null;
        if (! \is_int($window)) {
            throw new \InvalidArgumentException('Demo Academy attendance fixture missing int "simulation_window_days".');
        }
        if ($window < 0) {
            throw new \InvalidArgumentException(
                "Demo Academy attendance fixture 'simulation_window_days' must be >= 0, got {$window}.",
            );
        }

        $defaultProbability = $attendance['default_probability'] ?? null;
        if (! \is_int($defaultProbability) && ! \is_float($defaultProbability)) {
            throw new \InvalidArgumentException('Demo Academy attendance fixture missing numeric "default_probability".');
        }
        $defaultProbability = (float) $defaultProbability;
        if ($defaultProbability < 0.0 || $defaultProbability > 1.0) {
            throw new \InvalidArgumentException(
                "Demo Academy attendance fixture 'default_probability' must be in [0, 1], got {$defaultProbability}.",
            );
        }

        return new self(
            academyName: $name,
            academyAddress: $address,
            academyMonthlyFeeCents: $monthlyFeeCents,
            athletes: $athleteFixtures,
            trainingDaysOfWeek: $trainingDaysList,
            simulationWindowDays: $window,
            defaultProbability: $defaultProbability,
        );
    }

    /**
     * @return list<int>
     */
    private static function parseTrainingDays(mixed $raw): array
    {
        if (! \is_array($raw) || ! \array_is_list($raw)) {
            throw new \InvalidArgumentException('Demo Academy attendance fixture missing list "training_days_of_week".');
        }
        /** @var list<int> $list */
        $list = [];
        foreach ($raw as $day) {
            if (! \is_int($day)) {
                throw new \InvalidArgumentException('Demo Academy training_days_of_week entries must be ints.');
            }
            // Carbon dayOfWeek is 0..6 (Sunday..Saturday). Out-of-range
            // values silently produce zero matches inside eachTrainingDay()
            // — fail fast with a clear message instead of a quiet empty seed.
            if ($day < 0 || $day > 6) {
                throw new \InvalidArgumentException(
                    "Demo Academy training_days_of_week entries must be in 0..6 (Carbon::SUNDAY..Carbon::SATURDAY), got {$day}.",
                );
            }
            $list[] = $day;
        }

        return $list;
    }

    /**
     * Parse the structured address fixture (#72) into a typed array shape
     * the seeder can hand to `SyncAddressAction` verbatim. `null`
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
                'Demo Academy academy "address" must be an array of structured fields or null (#72 dropped the freeform string shape).',
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
                'Demo Academy academy address must include strings line1, city, postal_code, province, country.',
            );
        }
        if ($line2 !== null && ! \is_string($line2)) {
            throw new \InvalidArgumentException('Demo Academy academy address line2 must be string|null.');
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
