<?php

declare(strict_types=1);

namespace Database\Seeders\Support;

use App\Enums\AthleteStatus;
use App\Enums\Belt;

/**
 * Single athlete row inside the Demo Academy fixture file. Exists so the seeder
 * code reads `$athlete->firstName` instead of `$row['first_name']`, and so
 * the fixture loader can validate each row's shape at parse time.
 */
final readonly class DemoAcademyAthleteFixture
{
    public function __construct(
        public string $firstName,
        public string $lastName,
        public ?string $email,
        public ?string $dateOfBirth,
        public Belt $belt,
        public int $stripes,
        public ?string $joinedAt,
        public ?float $attendanceProbability,
        public AthleteStatus $status,
    ) {
    }

    /**
     * @param  array<string, mixed>  $row
     */
    public static function fromArray(array $row): self
    {
        $beltValue = self::requiredString($row, 'belt');
        try {
            $belt = Belt::from($beltValue);
        } catch (\ValueError $e) {
            throw new \InvalidArgumentException(
                "Demo Academy athlete fixture has invalid belt value '{$beltValue}'.",
                previous: $e,
            );
        }

        // `status` is optional in the row to keep older fixtures (and tests)
        // working without churn — defaults to Active when absent. When present
        // it must be a valid AthleteStatus backed-enum value.
        $statusValue = $row['status'] ?? null;
        if ($statusValue === null) {
            $status = AthleteStatus::Active;
        } else {
            if (! \is_string($statusValue)) {
                throw new \InvalidArgumentException("Demo Academy athlete fixture 'status' must be string|null.");
            }
            try {
                $status = AthleteStatus::from($statusValue);
            } catch (\ValueError $e) {
                throw new \InvalidArgumentException(
                    "Demo Academy athlete fixture has invalid status value '{$statusValue}'.",
                    previous: $e,
                );
            }
        }

        return new self(
            firstName: self::requiredString($row, 'first_name'),
            lastName: self::requiredString($row, 'last_name'),
            email: self::optionalString($row, 'email'),
            dateOfBirth: self::optionalDate($row, 'date_of_birth'),
            belt: $belt,
            stripes: self::requiredInt($row, 'stripes'),
            joinedAt: self::optionalDate($row, 'joined_at'),
            attendanceProbability: self::optionalProbability($row, 'attendance_probability'),
            status: $status,
        );
    }

    /** @param  array<string, mixed>  $row */
    private static function requiredString(array $row, string $key): string
    {
        $value = $row[$key] ?? null;
        if (! \is_string($value)) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture missing string '{$key}'.");
        }

        return $value;
    }

    /** @param  array<string, mixed>  $row */
    private static function optionalString(array $row, string $key): ?string
    {
        $value = $row[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (! \is_string($value)) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture '{$key}' must be string|null.");
        }

        return $value;
    }

    /** @param  array<string, mixed>  $row */
    private static function requiredInt(array $row, string $key): int
    {
        $value = $row[$key] ?? null;
        if (! \is_int($value)) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture missing int '{$key}'.");
        }

        return $value;
    }

    /** @param  array<string, mixed>  $row */
    private static function optionalProbability(array $row, string $key): ?float
    {
        $value = $row[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (! \is_int($value) && ! \is_float($value)) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture '{$key}' must be numeric|null.");
        }
        $float = (float) $value;
        if ($float < 0.0 || $float > 1.0) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture '{$key}' must be in [0, 1], got {$float}.");
        }

        return $float;
    }

    /**
     * Validates an optional `YYYY-MM-DD` date string. Carbon::parse later in
     * the seeder is permissive enough that bad strings produce confusing
     * deep stack traces; failing fast here with a fixture-aware message
     * makes the cause obvious.
     *
     * @param  array<string, mixed>  $row
     */
    private static function optionalDate(array $row, string $key): ?string
    {
        $value = $row[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (! \is_string($value)) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture '{$key}' must be string|null.");
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            throw new \InvalidArgumentException("Demo Academy athlete fixture '{$key}' must be YYYY-MM-DD, got '{$value}'.");
        }

        return $value;
    }
}
