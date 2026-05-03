<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use Database\Seeders\Support\DemoAcademyAthleteFixture;
use Database\Seeders\Support\DemoAcademyFixture;

function baseAthleteRow(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => null,
        'date_of_birth' => null,
        'belt' => 'white',
        'stripes' => 0,
        'joined_at' => null,
        'attendance_probability' => null,
    ], $overrides);
}

function baseFixtureArray(array $overrides = []): array
{
    return array_merge([
        // Address (#72) is optional — base fixture omits it; tests that
        // exercise the address branch override `academy` directly.
        'academy' => ['name' => 'Sample', 'address' => null],
        'athletes' => [],
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ], $overrides);
}

it('rejects a belt value that is not a Belt enum case', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['belt' => 'coral'])))
        ->toThrow(\InvalidArgumentException::class, 'invalid belt value');
});

it('rejects a date_of_birth that is not YYYY-MM-DD', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['date_of_birth' => '15/05/1990'])))
        ->toThrow(\InvalidArgumentException::class, 'must be YYYY-MM-DD');
});

it('rejects a joined_at that is not YYYY-MM-DD', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['joined_at' => 'tomorrow'])))
        ->toThrow(\InvalidArgumentException::class, 'must be YYYY-MM-DD');
});

it('rejects an attendance_probability outside [0, 1]', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => 1.5])))
        ->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => -0.1])))
        ->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
});

it('reports attendance_probability type errors as numeric|null', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => 'not-a-number'])))
        ->toThrow(\InvalidArgumentException::class, 'must be numeric|null');
});

it('rejects training_days_of_week entries outside 0..6', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 9],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be in 0..6');
});

it('rejects a non-list training_days_of_week (associative array)', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => ['mon' => 1, 'tue' => 2],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'training_days_of_week');
});

it('rejects a negative simulation_window_days', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => -7,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be >= 0');
});

it('rejects a default_probability outside [0, 1]', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => 365,
            'default_probability' => 1.7,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
});

it('parses a valid fixture without throwing', function (): void {
    $fixture = DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => [
            'name' => 'Apex Grappling Academy',
            'address' => [
                'line1' => 'Via Roma 42',
                'line2' => null,
                'city' => 'Milano',
                'postal_code' => '20121',
                'province' => 'MI',
                'country' => 'IT',
            ],
            'monthly_fee_cents' => 8000,
            'training_days_of_week' => [1, 3, 5],
        ],
        'athletes' => [
            baseAthleteRow(['first_name' => 'Marco', 'attendance_probability' => 1.0]),
        ],
    ]));

    expect($fixture->academyName)->toBe('Apex Grappling Academy');
    expect($fixture->academyAddress)->toBeArray();
    expect($fixture->academyAddress['line1'] ?? null)->toBe('Via Roma 42');
    expect($fixture->academyAddress['city'] ?? null)->toBe('Milano');
    expect($fixture->academyAddress['province'] ?? null)->toBe('MI');
    expect($fixture->academyMonthlyFeeCents)->toBe(8000);
    // The academy-level training_days_of_week wins over the attendance-level
    // one when both are present (academy is the authoritative source).
    expect($fixture->trainingDaysOfWeek)->toBe([1, 3, 5]);
    expect($fixture->simulationWindowDays)->toBe(365);
    expect($fixture->defaultProbability)->toBe(0.6);
    expect($fixture->athletes)->toHaveCount(1);
    expect($fixture->athletes[0]->firstName)->toBe('Marco');
    expect($fixture->athletes[0]->attendanceProbability)->toBe(1.0);
});

it('accepts a null academy address', function (): void {
    $fixture = DemoAcademyFixture::fromArray(baseFixtureArray());
    expect($fixture->academyAddress)->toBeNull();
});

it('rejects a freeform-string academy address (#72 dropped that shape)', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Sample', 'address' => 'Via Roma 1'],
    ])))->toThrow(\InvalidArgumentException::class, 'must be an array of structured fields');
});

it('rejects an academy address missing the required structured fields', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Sample', 'address' => ['line1' => 'Via Roma 1']],
    ])))->toThrow(\InvalidArgumentException::class, 'line1, city, postal_code, province, country');
});

// Status field — added with the demo academy seeder rebuild.

it('defaults missing status to Active', function (): void {
    $fixture = DemoAcademyAthleteFixture::fromArray(baseAthleteRow());
    expect($fixture->status)->toBe(AthleteStatus::Active);
});

it('parses an explicit status string into the enum', function (): void {
    $row = baseAthleteRow(['status' => 'suspended']);
    expect(DemoAcademyAthleteFixture::fromArray($row)->status)->toBe(AthleteStatus::Suspended);

    $row = baseAthleteRow(['status' => 'inactive']);
    expect(DemoAcademyAthleteFixture::fromArray($row)->status)->toBe(AthleteStatus::Inactive);
});

it('rejects an invalid status value', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['status' => 'pending'])))
        ->toThrow(\InvalidArgumentException::class, 'invalid status value');
});

it('rejects a status value that is not a string', function (): void {
    expect(fn () => DemoAcademyAthleteFixture::fromArray(baseAthleteRow(['status' => 42])))
        ->toThrow(\InvalidArgumentException::class, "'status' must be string|null");
});

// monthly_fee_cents — academy-level optional field.

it('accepts an integer monthly_fee_cents on the academy', function (): void {
    $fixture = DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Sample', 'address' => null, 'monthly_fee_cents' => 9500],
    ]));
    expect($fixture->academyMonthlyFeeCents)->toBe(9500);
});

it('treats a missing monthly_fee_cents as null', function (): void {
    $fixture = DemoAcademyFixture::fromArray(baseFixtureArray());
    expect($fixture->academyMonthlyFeeCents)->toBeNull();
});

it('rejects a non-int monthly_fee_cents on the academy', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Sample', 'address' => null, 'monthly_fee_cents' => '8000'],
    ])))->toThrow(\InvalidArgumentException::class, '"monthly_fee_cents" must be int|null');
});

it('rejects a negative monthly_fee_cents on the academy', function (): void {
    expect(fn () => DemoAcademyFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Sample', 'address' => null, 'monthly_fee_cents' => -100],
    ])))->toThrow(\InvalidArgumentException::class, "'monthly_fee_cents' must be >= 0");
});
