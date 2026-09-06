<?php

declare(strict_types=1);

use App\Support\Import\PhoneText;

/**
 * Splitting a phone number out of one spreadsheet column (#1346).
 *
 * Budojo stores a phone as a **pair** — `phone_country_code` +
 * `phone_national_number`, both filled or both null (#75). Nobody's sheet has
 * two columns. It has one, reading `+39 333 1234567`, or `333 1234567`, or
 * `0039 333 123 4567`, and the import has to get a pair out of it.
 */

it('splits an international number into the pair the column expects', function (string $text): void {
    expect(PhoneText::parse($text, null))->toBe([
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
})->with([
    '+39 333 1234567',
    '+393331234567',
    '+39-333-1234567',
    '  +39 333 123 4567  ',
    '0039 333 1234567',
]);

it('uses the academy own prefix when the number has none', function (): void {
    // Which is most sheets: an Italian academy writes Italian numbers without
    // a prefix, because everyone they call is Italian. The academy's own phone
    // is the best evidence available, and it is evidence — not a guess about
    // the world.
    expect(PhoneText::parse('333 1234567', '+39'))->toBe([
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
});

it('refuses a bare number when there is nothing to infer the country from', function (): void {
    // An academy that never filled in its own phone. Guessing +39 because the
    // app is written in Italian would be inventing data.
    expect(PhoneText::parse('333 1234567', null))->toBeNull();
});

it('prefers the number own prefix over the fallback', function (): void {
    // A roster with one foreign member. The cell knows better than the
    // academy's default, always.
    expect(PhoneText::parse('+44 7700 900123', '+39'))->toBe([
        'phone_country_code' => '+44',
        'phone_national_number' => '7700900123',
    ]);
});

it('gives nothing for an empty cell, which is not an error', function (?string $text): void {
    // Phone is optional. An empty column must import the athlete without one,
    // not report a row.
    expect(PhoneText::parse($text, '+39'))->toBeNull();
})->with([null, '', '   ', '-', 'n/a']);

it('refuses text that is not a number at all', function (string $text): void {
    expect(PhoneText::parse($text, '+39'))->toBeNull();
})->with(['casa', 'chiedere a mario', '@@@']);
