<?php

declare(strict_types=1);

use App\Support\Import\AthleteColumnMap;

/**
 * Guessing which column is which (#1346).
 */

it('maps the ordinary italian sheet with no help at all', function (): void {
    $map = AthleteColumnMap::guess(['Nome', 'Cognome', 'Cintura', 'Data di nascita', 'Telefono']);

    expect($map)->toBe([
        'first_name' => 'Nome',
        'last_name' => 'Cognome',
        'belt' => 'Cintura',
        'date_of_birth' => 'Data di nascita',
        'phone' => 'Telefono',
    ]);
});

it('does not let cognome be read as nome', function (): void {
    // The trap this class is written around: `cognome` CONTAINS `nome`, so a
    // substring rule maps the surname to first_name on the most ordinary
    // Italian file there is — and which column wins depends on iteration
    // order.
    $map = AthleteColumnMap::guess(['Cognome', 'Nome']);

    expect($map['first_name'])->toBe('Nome')
        ->and($map['last_name'])->toBe('Cognome');
});

it('maps an english sheet too', function (): void {
    $map = AthleteColumnMap::guess(['First Name', 'Last Name', 'Belt', 'Email']);

    expect(array_keys($map))->toBe(['first_name', 'last_name', 'belt', 'email']);
});

it('ignores case, padding and the separator style of a header', function (string $header): void {
    expect(AthleteColumnMap::guess([$header]))->toBe(['date_of_birth' => $header]);
})->with(['date of birth', 'Date Of Birth', 'DATE_OF_BIRTH', '  date-of-birth  ', 'Date.Of.Birth']);

it('leaves a column it does not recognise alone rather than forcing it somewhere', function (): void {
    $map = AthleteColumnMap::guess(['Nome', 'Peso', 'Note interne']);

    expect($map)->toBe(['first_name' => 'Nome']);
});

it('keeps the first of two columns that mean the same thing', function (): void {
    // A sheet with both `Nome` and `Nome atleta` wants a human to say which.
    // Quietly preferring the later one would hide that there was a choice.
    expect(AthleteColumnMap::guess(['Nome', 'Nome atleta'])['first_name'])->toBe('Nome');
});

it('has no unreachable entry in its own table', function (): void {
    // A guard against a real mistake made writing this: `normalise()` turns
    // `_` into a space, so a key written as `first_name` can never be looked
    // up — it sits in the table looking correct and matching nothing. Nothing
    // else would ever notice.
    $normalise = new ReflectionMethod(AthleteColumnMap::class, 'normalise');
    $names = new ReflectionClassConstant(AthleteColumnMap::class, 'NAMES');
    /** @var array<string, string> $table */
    $table = $names->getValue();

    foreach (array_keys($table) as $key) {
        expect($normalise->invoke(null, $key))->toBe($key, "the key '{$key}' cannot be matched by its own normaliser");
    }
});

it('only ever maps to a field the import can actually fill', function (): void {
    $names = new ReflectionClassConstant(AthleteColumnMap::class, 'NAMES');
    /** @var array<string, string> $table */
    $table = $names->getValue();

    expect(array_values(array_unique(array_values($table))))
        ->each->toBeIn(AthleteColumnMap::FIELDS);
});
