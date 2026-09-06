<?php

declare(strict_types=1);

namespace App\Support\Import;

/**
 * A CSV file, read into a header and numbered rows (#1346).
 *
 * Two things here are not incidental.
 *
 * **The delimiter is detected, not assumed.** Excel in an Italian locale
 * writes `;`, not `,` — because the comma is the decimal separator — and it
 * does so from "Save as CSV" without asking. A reader hard-coded to `,` sees
 * one enormous column, reports "no columns found", and the owner has no way to
 * tell that the file is fine and the reader is wrong. This is the single most
 * likely reason an import would fail for the person it was built for.
 *
 * **Row numbers are the ones Excel shows.** The header is row 1, so the first
 * athlete is row 2. Reporting "row 0" or "row 1" for the first data row would
 * send someone to the wrong line of their own file, which is worse than no
 * number at all.
 */
final class AthleteCsv
{
    /** Candidates in the order a tie should be broken. */
    private const DELIMITERS = [';', ',', "\t", '|'];

    /**
     * @param list<string>                        $header
     * @param list<array{number: int, cells: list<string>}> $rows
     */
    private function __construct(
        public readonly array $header,
        public readonly array $rows,
        public readonly string $delimiter,
    ) {
    }

    public static function read(string $contents): self
    {
        $text = self::stripBom($contents);
        $delimiter = self::detectDelimiter($text);

        $handle = fopen('php://memory', 'r+');
        if ($handle === false) {
            return new self([], [], $delimiter);
        }

        fwrite($handle, $text);
        rewind($handle);

        $header = [];
        /** @var list<array{number: int, cells: list<string>}> $rows */
        $rows = [];
        $number = 0;

        while (($cells = fgetcsv($handle, 0, $delimiter, '"', '\\')) !== false) {
            $number++;
            /** @var list<string> $clean */
            $clean = array_map(static fn (?string $cell): string => trim($cell ?? ''), $cells);

            if ($number === 1) {
                $header = $clean;

                continue;
            }

            // A trailing newline, or a blank line someone left in the middle,
            // is not a row that failed to import — it is not a row. Reporting
            // it would put noise in front of the real problems.
            if (self::isBlank($clean)) {
                continue;
            }

            $rows[] = ['number' => $number, 'cells' => $clean];
        }

        fclose($handle);

        return new self($header, $rows, $delimiter);
    }

    /**
     * The cells of one row, keyed by header name.
     *
     * Short rows are normal — a spreadsheet stops writing separators once the
     * remaining cells are empty — so a missing column reads as empty rather
     * than as an error.
     *
     * @param list<string> $cells
     *
     * @return array<string, string>
     */
    public function keyed(array $cells): array
    {
        $keyed = [];
        foreach ($this->header as $index => $name) {
            $keyed[$name] = $cells[$index] ?? '';
        }

        return $keyed;
    }

    /**
     * Excel writes a UTF-8 BOM and never mentions it. Left in place it becomes
     * part of the first header name, so `nome` silently stops matching and the
     * first column can never be mapped — with everything else working, which
     * is the confusing kind of broken.
     */
    private static function stripBom(string $contents): string
    {
        return str_starts_with($contents, "\xEF\xBB\xBF") ? substr($contents, 3) : $contents;
    }

    /**
     * Whichever candidate splits the header row into the most columns.
     *
     * Counted on the header alone, and outside quotes, so a comma inside
     * `"Rossi, Marco"` in some later row cannot outvote the real separator.
     */
    private static function detectDelimiter(string $text): string
    {
        // `strtok` answers `false` for an empty subject, never an empty
        // string — so this one check covers the empty file too.
        $firstLine = strtok($text, "\r\n");
        if ($firstLine === false) {
            return ',';
        }

        $best = ',';
        $bestCount = 0;
        foreach (self::DELIMITERS as $candidate) {
            $parsed = str_getcsv($firstLine, $candidate, '"', '\\');
            $count = \count($parsed);
            if ($count > $bestCount) {
                $best = $candidate;
                $bestCount = $count;
            }
        }

        return $best;
    }

    /** @param list<string> $cells */
    private static function isBlank(array $cells): bool
    {
        foreach ($cells as $cell) {
            if ($cell !== '') {
                return false;
            }
        }

        return true;
    }
}
