<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Support\Import\BeltText;

/**
 * Reading a belt out of a spreadsheet cell (#1346).
 *
 * The point of this class is that a real academy's file does not contain
 * `blue`. It contains `Blu`, or `cintura blu`, or `BLU`, or a stray trailing
 * space from a copy-paste. A parser that only accepts the API's wire format
 * would reject essentially every file anyone actually has, which makes the
 * import worse than useless — it would look broken.
 */

it('accepts the value the API itself uses', function (string $value): void {
    expect(BeltText::parse($value))->toBe(Belt::from($value));
})->with(array_map(static fn (Belt $b): string => $b->value, Belt::cases()));

it('accepts the italian name, which is what the file will actually say', function (string $italian, Belt $belt): void {
    expect(BeltText::parse($italian))->toBe($belt);
})->with([
    ['bianca', Belt::White],
    ['grigia', Belt::Grey],
    ['gialla', Belt::Yellow],
    ['arancione', Belt::Orange],
    ['verde', Belt::Green],
    ['blu', Belt::Blue],
    ['viola', Belt::Purple],
    ['marrone', Belt::Brown],
    ['nera', Belt::Black],
    ['rossa', Belt::Red],
]);

it('accepts the masculine form too, because both are written', function (): void {
    // "cintura bianca" is correct Italian, but people type "bianco" as often
    // as not — and rejecting it would be pedantry with a cost.
    expect(BeltText::parse('bianco'))->toBe(Belt::White)
        ->and(BeltText::parse('nero'))->toBe(Belt::Black)
        ->and(BeltText::parse('giallo'))->toBe(Belt::Yellow);
});

it('ignores the word cintura, and the case, and the spaces around it', function (string $text): void {
    expect(BeltText::parse($text))->toBe(Belt::Blue);
})->with([
    'blu',
    'Blu',
    'BLU',
    '  blu  ',
    'cintura blu',
    'Cintura Blu',
    'cintura   blu',
    'azzurra',
    'blue',
    'Blue',
]);

it('reads the coral belts however they are written', function (string $text, Belt $belt): void {
    expect(BeltText::parse($text))->toBe($belt);
})->with([
    ['red-and-black', Belt::RedAndBlack],
    ['rosso-nera', Belt::RedAndBlack],
    ['rossa e nera', Belt::RedAndBlack],
    ['coral', Belt::RedAndBlack],
    ['red-and-white', Belt::RedAndWhite],
    ['rosso-bianca', Belt::RedAndWhite],
    ['rossa e bianca', Belt::RedAndWhite],
]);

it('refuses what it does not recognise instead of guessing', function (?string $text): void {
    // A wrong belt is worse than a rejected row: the row comes back in the
    // preview with a reason, whereas a silent guess lands a purple belt on a
    // white belt's record and nobody finds out.
    expect(BeltText::parse($text))->toBeNull();
})->with([null, '', '   ', 'cintura', 'chartreuse', '42', 'bl']);
