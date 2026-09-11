<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The form a name is ORDERED and SEARCHED by, as opposed to the form it is
 * written in (#1527).
 *
 * `first_name` and `last_name` are plain columns and SQLite orders them with
 * its default BINARY collation — by code point. On a roster of Brazilian jiu
 * jitsu athletes that is not a corner case:
 *
 *   - `da Silva`, `de Souza`, `dos Santos` sort AFTER every capitalised
 *     surname, because `d` (100) is above `Z` (90). Three of the most common
 *     surnames in the sport, all at the bottom of the list.
 *   - `Ângelo`, `Érika`, `Núñez`, `Öztürk` sort after `z` for the same reason,
 *     one code point further out.
 *   - `Élena` and `Elena` land in different halves of the alphabet.
 *
 * And LIKE, which is case-insensitive for ASCII only, cannot find `Ângelo` for
 * someone typing `angelo`.
 *
 * So the two columns have a folded twin — lower-cased, diacritics removed —
 * that every ORDER BY and every search reads instead. They are **generated
 * columns**: SQLite derives them from the source column, so there is no write
 * path to keep in sync and no way for them to go stale.
 *
 * **The map below and the column definition in the database are the same
 * knowledge in two places.** The migration builds the column from
 * `sqlExpression()`, and once a column is created its expression is frozen in
 * the schema — editing this map does NOT change an existing database. Adding a
 * pair here therefore needs a migration that rebuilds the columns, and
 * `AthleteNameCollationTest` fails until the two agree again — it reads
 * the column back out of the database and compares it to `fold()`.
 *
 * Not an ICU collation: that would mean a custom SQLite collation registered on
 * every connection the app opens — web, queue, artisan, and the desktop build's
 * own bundled PHP — and it could not use an index. Folding covers the Latin
 * scripts an academy actually enrols, and `Collator('it_IT')` agrees with it on
 * every name in the test fixture.
 */
final class NameFold
{
    /**
     * Lower-case accented character → its ASCII form.
     *
     * Upper-case forms are derived, not listed: `sqlExpression()` and `fold()`
     * both handle `À` alongside `à`. Two entries per letter would be two places
     * to forget one.
     *
     * The set is the Latin-script diacritics that turn up on a mat: Italian,
     * Portuguese and Spanish first (this is a BJJ app), then French, German and
     * the Nordic and Slavic letters that arrive with a visiting athlete.
     *
     * @var array<string, string>
     */
    public const MAP = [
        'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
        'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o',
        'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'ç' => 'c', 'ñ' => 'n', 'ý' => 'y', 'ÿ' => 'y',
        'š' => 's', 'ž' => 'z', 'č' => 'c', 'ć' => 'c', 'ł' => 'l',
        // Two-letter expansions, last so no earlier pair can split them.
        'æ' => 'ae', 'œ' => 'oe', 'ß' => 'ss',
    ];

    /**
     * The PHP side of the fold — what a search needle goes through before it
     * meets a folded column.
     *
     * **ASCII-only lower-casing, deliberately**, because that is all SQLite's
     * `lower()` does and the two sides have to produce byte-identical results.
     * `mb_strtolower` here instead looked more correct and silently broke every
     * name carrying an upper-case letter the map does not cover: the column
     * kept `Şahin`, the needle became `şahin`, and no spelling of the query
     * could reach the row any more — worse than before this class existed,
     * where at least the exact spelling matched. `/prereview` found it; the
     * equivalence test below now carries an out-of-map name so it cannot come
     * back.
     *
     * A letter outside the map is therefore left exactly as written, on both
     * sides. `Şahin` is findable as `Şahin`, not as `sahin` — adding Turkish to
     * the map is what would change that, and it needs a migration.
     */
    public static function fold(string $value): string
    {
        foreach (self::MAP as $accented => $plain) {
            $value = str_replace(
                [$accented, mb_strtoupper($accented)],
                $plain,
                $value,
            );
        }

        return strtr($value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
    }

    /**
     * The SQL side — the expression a generated column is defined by.
     *
     * **`lower()` goes outermost and folds only ASCII.** SQLite's `lower()`
     * leaves every non-ASCII byte alone, so an upper-case `Ö` walks straight
     * through it and out past `z`; the first version of this shipped that way
     * in a spike and put `Öztürk` below `Zanetti`. Hence both cases in the
     * REPLACE chain, and `lower()` left to do the A-Z half only.
     *
     * The caller passes a bare column name it controls — this is used by a
     * migration, never with user input.
     */
    public static function sqlExpression(string $column): string
    {
        $expression = $column;

        foreach (self::MAP as $accented => $plain) {
            // Every pair in the map has a distinct upper-case form — `ß`
            // included, which upper-cases to `SS` and so folds a literal `SS`
            // to `ss` as well. `lower()` would have done that anyway.
            $expression = "REPLACE({$expression},'{$accented}','{$plain}')";
            $expression = \sprintf("REPLACE(%s,'%s','%s')", $expression, mb_strtoupper($accented), $plain);
        }

        return "lower({$expression})";
    }
}
