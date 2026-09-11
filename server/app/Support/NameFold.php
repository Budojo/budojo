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
 * So each name column has a folded twin — `first_name_sort`, `last_name_sort` —
 * that every ORDER BY and every search reads instead, and a search needle goes
 * through the same `fold()` before it meets them.
 *
 * **The columns are written, not derived.** `AthleteObserver::saving()` fills
 * them on every write. The first version made them SQLite generated columns,
 * which was better in every way except the one that counts: the REPLACE chain
 * they were defined by is ~74 calls deep, and SQLite's parser stack depth is a
 * compile-time constant. The dev container took 120 levels; CI's build threw
 * `parser stack overflow` at 74. The desktop app bundles its own PHP, so the
 * SQLite that would run that migration on an owner's machine is whichever build
 * went into the installer — an expression frozen into the schema has to be
 * portable to a database we do not compile, and that one was not.
 *
 * The cost of writing them is a path that can drift. `AthleteNameCollationTest`
 * is what holds it: it reads the stored keys back out and compares them to
 * `fold()`, after an insert and after a rename. The only way past the observer
 * is a raw `DB::table('athletes')` update touching a name — there are none
 * today, and a future one has to fold by hand.
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
     * Upper-case forms are derived, not listed — `fold()` handles `À` alongside
     * `à`. Two entries per letter would be two places to forget one.
     *
     * Changing this map changes how names sort, but NOT the keys already
     * stored: they were folded by the map as it stood when each row was last
     * written. A map change needs a migration that re-folds the table.
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
     * Fold a name — or a search needle — into the form the sort keys hold.
     *
     * **ASCII-only lower-casing.** It began as a constraint: SQLite's `lower()`
     * is ASCII-only and a generated column had to agree with this method byte
     * for byte. Getting that wrong broke every name carrying an upper-case
     * letter outside the map — `Şahin` in the column, `şahin` in the needle,
     * the row unreachable by any spelling — which `/prereview` caught.
     *
     * The constraint is gone now that PHP writes both sides, and the choice
     * stays, because it is the one that can be stated exactly: **the map, plus
     * A-Z.** `mb_strtolower` would fold more scripts and bring its own corners
     * with it (`İ` lower-cases to `i` plus a combining dot, which no one typing
     * `istanbul` will produce).
     *
     * So a letter outside the map is left as written. `Şahin` is findable as
     * `Şahin`, not as `sahin`; adding Turkish to the map is what would change
     * that, and it needs a migration to re-fold the rows.
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
}
