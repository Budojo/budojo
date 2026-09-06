<?php

declare(strict_types=1);

use App\Support\Import\AthleteCsv;

/**
 * Reading the file the academy actually has (#1346).
 */

it('detects the semicolon italian excel writes, without being told', function (): void {
    // The single most likely way this import fails for the person it exists
    // for: Excel in an Italian locale separates with `;`, because the comma is
    // the decimal separator. A reader fixed on `,` sees one giant column and
    // reports "no columns", which looks like a broken file rather than a
    // broken reader.
    $csv = AthleteCsv::read("nome;cognome;cintura\nMarco;Rossi;blu\n");

    expect($csv->delimiter)->toBe(';')
        ->and($csv->header)->toBe(['nome', 'cognome', 'cintura'])
        ->and($csv->rows)->toHaveCount(1);
});

it('still reads a comma file', function (): void {
    $csv = AthleteCsv::read("first_name,last_name,belt\nMarco,Rossi,blue\n");

    expect($csv->delimiter)->toBe(',')
        ->and($csv->header)->toBe(['first_name', 'last_name', 'belt']);
});

it('does not let a comma inside a quoted name outvote the real separator', function (): void {
    $csv = AthleteCsv::read("nome;cognome\n\"Rossi, Marco\";Bianchi\n");

    expect($csv->delimiter)->toBe(';')
        ->and($csv->keyed($csv->rows[0]['cells']))->toBe(['nome' => 'Rossi, Marco', 'cognome' => 'Bianchi']);
});

it('strips the byte order mark excel writes and never mentions', function (): void {
    // Left in place it becomes part of the first header name, so `nome` stops
    // matching and the first column can never be mapped — while everything
    // else works, which is the confusing kind of broken.
    $csv = AthleteCsv::read("\xEF\xBB\xBFnome;cognome\nMarco;Rossi\n");

    expect($csv->header)->toBe(['nome', 'cognome']);
});

it('numbers rows the way excel does, so a report points at the right line', function (): void {
    $csv = AthleteCsv::read("nome\nMarco\nLuca\n");

    // Header is row 1. Telling someone "row 1 is wrong" about the first
    // athlete sends them to the header.
    expect(array_column($csv->rows, 'number'))->toBe([2, 3]);
});

it('skips blank lines instead of reporting them as failures', function (): void {
    // A trailing newline is not a row that failed to import. Reporting it
    // would put noise in front of the real problems.
    $csv = AthleteCsv::read("nome;cognome\nMarco;Rossi\n\n;\nLuca;Bianchi\n");

    expect($csv->rows)->toHaveCount(2)
        ->and(array_column($csv->rows, 'number'))->toBe([2, 5]);
});

it('reads a short row as empty cells rather than an error', function (): void {
    // A spreadsheet stops writing separators once the rest of the line is
    // empty. That is a complete athlete with no phone, not a malformed row.
    $csv = AthleteCsv::read("nome;cognome;telefono\nMarco;Rossi\n");

    expect($csv->keyed($csv->rows[0]['cells']))
        ->toBe(['nome' => 'Marco', 'cognome' => 'Rossi', 'telefono' => '']);
});

it('trims the padding a hand-edited file collects', function (): void {
    $csv = AthleteCsv::read("nome ; cognome\n Marco ;Rossi \n");

    expect($csv->header)->toBe(['nome', 'cognome'])
        ->and($csv->keyed($csv->rows[0]['cells']))->toBe(['nome' => 'Marco', 'cognome' => 'Rossi']);
});

it('survives an empty file without pretending it had content', function (): void {
    expect(AthleteCsv::read('')->rows)->toBe([]);
});
