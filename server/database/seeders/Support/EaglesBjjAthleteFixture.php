<?php

declare(strict_types=1);

namespace Database\Seeders\Support;

use App\Enums\Belt;

/**
 * Single athlete row inside the Eagles BJJ fixture file. Exists so the seeder
 * code reads `$athlete->firstName` instead of `$row['first_name']`, and so
 * the fixture loader can validate each row's shape at parse time.
 */
final readonly class EaglesBjjAthleteFixture
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
    ) {
    }

    /**
     * @param  array<string, mixed>  $row
     */
    public static function fromArray(array $row): self
    {
        return new self(
            firstName: self::requiredString($row, 'first_name'),
            lastName: self::requiredString($row, 'last_name'),
            email: self::optionalString($row, 'email'),
            dateOfBirth: self::optionalString($row, 'date_of_birth'),
            belt: Belt::from(self::requiredString($row, 'belt')),
            stripes: self::requiredInt($row, 'stripes'),
            joinedAt: self::optionalString($row, 'joined_at'),
            attendanceProbability: self::optionalFloat($row, 'attendance_probability'),
        );
    }

    /** @param  array<string, mixed>  $row */
    private static function requiredString(array $row, string $key): string
    {
        $value = $row[$key] ?? null;
        if (! \is_string($value)) {
            throw new \InvalidArgumentException("Eagles BJJ athlete fixture missing string '{$key}'.");
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
            throw new \InvalidArgumentException("Eagles BJJ athlete fixture '{$key}' must be string|null.");
        }

        return $value;
    }

    /** @param  array<string, mixed>  $row */
    private static function requiredInt(array $row, string $key): int
    {
        $value = $row[$key] ?? null;
        if (! \is_int($value)) {
            throw new \InvalidArgumentException("Eagles BJJ athlete fixture missing int '{$key}'.");
        }

        return $value;
    }

    /** @param  array<string, mixed>  $row */
    private static function optionalFloat(array $row, string $key): ?float
    {
        $value = $row[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (! \is_int($value) && ! \is_float($value)) {
            throw new \InvalidArgumentException("Eagles BJJ athlete fixture '{$key}' must be float|null.");
        }

        return (float) $value;
    }
}
