<?php

declare(strict_types=1);

use App\Enums\Sex;
use App\Support\FiscalCode;
use Carbon\CarbonImmutable;

/**
 * The Italian codice fiscale (#1934), read the way DM 23/12/1976 writes it.
 *
 * Every code here is synthetic: built from the published algorithm, not from
 * a real person. RSSMRA80A01H501U is the textbook example the algorithm is
 * usually checked against.
 */
it('accepts a code whose check character matches', function (string $code): void {
    expect(FiscalCode::parse($code))->not->toBeNull();
})->with([
    'the textbook example' => ['RSSMRA80A01H501U'],
    'a man born in Rome' => ['RSSMRA90C15H501O'],
    'a girl born in Milan' => ['BNCGLI15H52F205N'],
    'born abroad (Z…)' => ['SMTJHN85A01Z404P'],
]);

it('refuses a wrong check character, a bad shape, or a date that cannot exist', function (string $code): void {
    expect(FiscalCode::parse($code))->toBeNull();
})->with([
    'wrong check character' => ['RSSMRA90C15H501A'],
    'too short' => ['RSSMRA90C15H501'],
    'a digit where a letter goes' => ['RSSMR190C15H501P'],
    'no such month letter' => ['RSSMRA90F15H501W'],
    'the 31st of February' => ['RSSMRA90B31H501Y'],
]);

it('accepts an omocodic code: digits replaced by letters to tell two people apart', function (string $code): void {
    $parsed = FiscalCode::parse($code);

    expect($parsed)->not->toBeNull()
        ->and($parsed?->birthDate(CarbonImmutable::parse('2026-09-27'))->toDateString())->toBe('1990-03-15');
})->with([
    'one substitution' => ['RSSMRA90C15H50MG'],
    'three substitutions' => ['RSSMRA90C15HRLMM'],
    'every position' => ['RSSMRAVLCMRHRLMS'],
]);

it('reads the date of birth and the sex', function (): void {
    $today = CarbonImmutable::parse('2026-09-27');

    $man = FiscalCode::parse('RSSMRA90C15H501O');
    $girl = FiscalCode::parse('BNCGLI15H52F205N');

    expect($man?->birthDate($today)->toDateString())->toBe('1990-03-15')
        ->and($man?->sex)->toBe(Sex::Male)
        // Women's day of birth is written +40: 52 is the 12th.
        ->and($girl?->birthDate($today)->toDateString())->toBe('2015-06-12')
        ->and($girl?->sex)->toBe(Sex::Female);
});

it('puts a two-digit year in the latest century that is not in the future', function (): void {
    $today = CarbonImmutable::parse('2026-09-27');

    expect(FiscalCode::parse('FRRLCU17E20L219B')?->birthDate($today)->year)->toBe(2017)
        ->and(FiscalCode::parse('RSSMRA90C15H501O')?->birthDate($today)->year)->toBe(1990);
});

it('reads a code typed in lower case or with spaces', function (): void {
    expect(FiscalCode::normalise(' rssmra 90c15 h501o '))->toBe('RSSMRA90C15H501O')
        ->and(FiscalCode::parse('rssmra90c15h501o'))->not->toBeNull();
});
