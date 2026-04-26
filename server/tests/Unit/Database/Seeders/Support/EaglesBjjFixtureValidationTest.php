<?php

declare(strict_types=1);

use Database\Seeders\Support\EaglesBjjAthleteFixture;
use Database\Seeders\Support\EaglesBjjFixture;

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
        'academy' => ['name' => 'Sample', 'address' => 'Address'],
        'athletes' => [],
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ], $overrides);
}

it('rejects a belt value that is not a Belt enum case', function (): void {
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['belt' => 'coral'])))
        ->toThrow(\InvalidArgumentException::class, 'invalid belt value');
});

it('rejects a date_of_birth that is not YYYY-MM-DD', function (): void {
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['date_of_birth' => '15/05/1990'])))
        ->toThrow(\InvalidArgumentException::class, 'must be YYYY-MM-DD');
});

it('rejects a joined_at that is not YYYY-MM-DD', function (): void {
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['joined_at' => 'tomorrow'])))
        ->toThrow(\InvalidArgumentException::class, 'must be YYYY-MM-DD');
});

it('rejects an attendance_probability outside [0, 1]', function (): void {
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => 1.5])))
        ->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => -0.1])))
        ->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
});

it('reports attendance_probability type errors as numeric|null', function (): void {
    expect(fn () => EaglesBjjAthleteFixture::fromArray(baseAthleteRow(['attendance_probability' => 'not-a-number'])))
        ->toThrow(\InvalidArgumentException::class, 'must be numeric|null');
});

it('rejects training_days_of_week entries outside 0..6', function (): void {
    expect(fn () => EaglesBjjFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 9],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be in 0..6');
});

it('rejects a non-list training_days_of_week (associative array)', function (): void {
    expect(fn () => EaglesBjjFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => ['mon' => 1, 'tue' => 2],
            'simulation_window_days' => 365,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'training_days_of_week');
});

it('rejects a negative simulation_window_days', function (): void {
    expect(fn () => EaglesBjjFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => -7,
            'default_probability' => 0.6,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be >= 0');
});

it('rejects a default_probability outside [0, 1]', function (): void {
    expect(fn () => EaglesBjjFixture::fromArray(baseFixtureArray([
        'attendance' => [
            'training_days_of_week' => [2, 4, 6],
            'simulation_window_days' => 365,
            'default_probability' => 1.7,
        ],
    ])))->toThrow(\InvalidArgumentException::class, 'must be in [0, 1]');
});

it('parses a valid fixture without throwing', function (): void {
    $fixture = EaglesBjjFixture::fromArray(baseFixtureArray([
        'academy' => ['name' => 'Eagles BJJ', 'address' => 'Via Piana, 1'],
        'athletes' => [
            baseAthleteRow(['first_name' => 'Matteo', 'attendance_probability' => 1.0]),
        ],
    ]));

    expect($fixture->academyName)->toBe('Eagles BJJ');
    expect($fixture->trainingDaysOfWeek)->toBe([2, 4, 6]);
    expect($fixture->simulationWindowDays)->toBe(365);
    expect($fixture->defaultProbability)->toBe(0.6);
    expect($fixture->athletes)->toHaveCount(1);
    expect($fixture->athletes[0]->firstName)->toBe('Matteo');
    expect($fixture->athletes[0]->attendanceProbability)->toBe(1.0);
});
