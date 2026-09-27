<?php

declare(strict_types=1);

namespace App\Support\Csv;

/**
 * The one way a file leaves Budojo as a spreadsheet (#1762).
 *
 * Built for the reader who actually opens it: an Italian Excel, by
 * double-click. That reader decides every choice here, and the members-list
 * export (#1942) reuses it for the same reader:
 *
 * - **A byte-order mark first.** Without it Excel reads UTF-8 as the local
 *   code page and every accented surname comes back as mojibake.
 * - **`;` between cells.** An Italian Excel splits on its list separator,
 *   which is the semicolon; a comma-separated file lands in one column.
 * - **`\r\n` after each row**, as Excel and RFC 4180 expect.
 * - **No cell starts a formula.** A value beginning with `=`, `+`, `-` or `@`
 *   (or a tab or return) is run by Excel as a formula: an athlete named
 *   `=HYPERLINK(…)` becomes a link to anywhere. Such a cell gets a leading
 *   apostrophe, which Excel shows as text and hides.
 *
 * It writes to a stream it is given, so a response streams row by row and a
 * test reads it back from memory. Formatting a date or an amount is
 * {@see CsvValue}'s job, not this class's.
 */
final class CsvWriter
{
    private const string SEPARATOR = ';';

    private const string BYTE_ORDER_MARK = "\xEF\xBB\xBF";

    /** What makes a spreadsheet treat a cell as a formula. */
    private const array FORMULA_STARTS = ['=', '+', '-', '@', "\t", "\r"];

    /**
     * @param resource $stream
     */
    private function __construct(private $stream)
    {
    }

    /**
     * Starts a file on `$stream`, byte-order mark first.
     *
     * @param resource $stream
     */
    public static function open($stream): self
    {
        fwrite($stream, self::BYTE_ORDER_MARK);

        return new self($stream);
    }

    /**
     * One row. A missing value is an empty cell, never "null".
     *
     * @param list<string|int|null> $cells
     */
    public function row(array $cells): void
    {
        fputcsv($this->stream, array_map(self::cell(...), $cells), self::SEPARATOR, '"', '', "\r\n");
    }

    /** A value as a cell: empty for null, and never the start of a formula. */
    public static function cell(string|int|null $value): string
    {
        $text = (string) $value;

        return $text !== '' && \in_array($text[0], self::FORMULA_STARTS, true) ? "'" . $text : $text;
    }
}
