<?php

declare(strict_types=1);

use App\Support\Csv\CsvValue;
use App\Support\Csv\CsvWriter;
use Carbon\CarbonImmutable;

/**
 * The one CSV writer (#1762), built for the members-list export (#1942) to
 * reuse: a file an Italian Excel opens by double-click, accents and columns
 * intact, and never a cell it would run as a formula.
 */
function csvOf(callable $write): string
{
    $stream = fopen('php://memory', 'w+b');
    assert($stream !== false);
    $write(CsvWriter::open($stream));
    rewind($stream);

    return (string) stream_get_contents($stream);
}

it('opens with a byte-order mark, or Excel reads accented names as mojibake', function (): void {
    expect(csvOf(fn () => null))->toBe("\xEF\xBB\xBF");
});

it('separates with a semicolon and ends each row the way Excel expects', function (): void {
    $body = csvOf(function (CsvWriter $csv): void {
        $csv->row(['Data', 'Atleta']);
        $csv->row(['03/09/2026', 'Niccolò Ferré']);
    });

    // An Italian Excel splits on `;`: with commas the whole row lands in one column.
    expect($body)->toBe("\xEF\xBB\xBFData;Atleta\r\n03/09/2026;\"Niccolò Ferré\"\r\n");
});

it('quotes what needs quoting', function (): void {
    $body = csvOf(fn (CsvWriter $csv) => $csv->row(['Rossi; Bianchi', 'dice "ciao"', 'semplice']));

    expect($body)->toBe("\xEF\xBB\xBF\"Rossi; Bianchi\";\"dice \"\"ciao\"\"\";semplice\r\n");
});

it('writes an empty cell for a missing value, never "null"', function (): void {
    expect(csvOf(fn (CsvWriter $csv) => $csv->row(['a', null, 3])))->toBe("\xEF\xBB\xBFa;;3\r\n");
});

it('never lets a cell start a formula', function (string $cell): void {
    // `=`, `+`, `-`, `@` (and a leading tab or return) make Excel evaluate the
    // cell. An athlete named `=HYPERLINK(…)` is data, and stays data.
    expect(CsvWriter::cell($cell))->toBe("'" . $cell);
})->with(['=HYPERLINK("http://x")', '+39 333', '-5', '@SUM(A1)', "\tx", "\rx"]);

it('leaves ordinary text alone', function (string $cell): void {
    expect(CsvWriter::cell($cell))->toBe($cell);
})->with(['Rossi Marco', '165,00', '03/09/2026', 'A7K2', '']);

it('writes a date the way an Italian reads it', function (): void {
    expect(CsvValue::date(CarbonImmutable::create(2026, 9, 3)))->toBe('03/09/2026');
});

it('writes cents as money with a decimal comma, without ever making a float', function (int $cents, string $money): void {
    expect(CsvValue::money($cents))->toBe($money);
})->with([
    [16500, '165,00'],
    [7000, '70,00'],
    [5, '0,05'],
    [0, '0,00'],
    [123456789, '1234567,89'],
]);
