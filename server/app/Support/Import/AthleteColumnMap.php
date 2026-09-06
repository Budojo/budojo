<?php

declare(strict_types=1);

namespace App\Support\Import;

/**
 * Which column holds which athlete field (#1346).
 *
 * The guess exists so the common file needs no work at all — an academy whose
 * sheet says `Nome | Cognome | Cintura` should not have to explain that to
 * anyone. But it is only ever a **suggestion**: the import shows the mapping
 * it chose and lets it be corrected before a single row is read, because a
 * silent wrong guess writes surnames into the first-name column of sixty
 * records and looks like a successful import while doing it.
 *
 * Matching is **exact on a normalised name**, never by substring. `cognome`
 * contains `nome`, so a substring rule maps the surname column to
 * `first_name` on the most ordinary Italian file there is — and whichever
 * column loses the race depends on iteration order, which is the worst kind of
 * bug to explain.
 */
final class AthleteColumnMap
{
    /** Every field the import can fill. The order the preview shows them in. */
    public const FIELDS = [
        'first_name',
        'last_name',
        'belt',
        'stripes',
        'status',
        'joined_at',
        'email',
        'phone',
        'date_of_birth',
    ];
    /**
     * Header name (normalised) → athlete field.
     *
     * Ordered by field for reading; lookup is a hash, so order carries no
     * meaning and adding a synonym cannot change an existing answer.
     *
     * @var array<string, string>
     */
    private const NAMES = [
        'firstname' => 'first_name',
        'first name' => 'first_name',
        'nome' => 'first_name',
        'nome atleta' => 'first_name',
        'given name' => 'first_name',

        'lastname' => 'last_name',
        'last name' => 'last_name',
        'cognome' => 'last_name',
        'surname' => 'last_name',
        'family name' => 'last_name',

        'belt' => 'belt',
        'cintura' => 'belt',
        'grado' => 'belt',
        'rank' => 'belt',

        'stripes' => 'stripes',
        'gradi' => 'stripes',
        'strisce' => 'stripes',
        'degrees' => 'stripes',

        'status' => 'status',
        'stato' => 'status',

        'email' => 'email',
        'e mail' => 'email',
        'mail' => 'email',
        'posta elettronica' => 'email',

        'phone' => 'phone',
        'telefono' => 'phone',
        'cellulare' => 'phone',
        'tel' => 'phone',
        'mobile' => 'phone',
        'numero di telefono' => 'phone',

        'date of birth' => 'date_of_birth',
        'dob' => 'date_of_birth',
        'birthday' => 'date_of_birth',
        'birthdate' => 'date_of_birth',
        'data di nascita' => 'date_of_birth',
        'data nascita' => 'date_of_birth',
        'nascita' => 'date_of_birth',
        'compleanno' => 'date_of_birth',

        'joined' => 'joined_at',
        'joined at' => 'joined_at',
        'join date' => 'joined_at',
        'start date' => 'joined_at',
        'data iscrizione' => 'joined_at',
        'data di iscrizione' => 'joined_at',
        'iscrizione' => 'joined_at',
        'iscritto il' => 'joined_at',
        'tesseramento' => 'joined_at',
    ];

    /**
     * @param list<string> $header
     *
     * @return array<string, string> field => the header name that carries it
     */
    public static function guess(array $header): array
    {
        $map = [];
        foreach ($header as $name) {
            $field = self::NAMES[self::normalise($name)] ?? null;

            // First column wins. A sheet with two columns a rule recognises as
            // the same field is a sheet whose mapping wants correcting by
            // hand — quietly preferring the later one would hide that.
            if ($field !== null && ! isset($map[$field])) {
                $map[$field] = $name;
            }
        }

        return $map;
    }

    private static function normalise(string $name): string
    {
        $lower = mb_strtolower(trim($name));
        $spaced = (string) preg_replace('/[-_.\/]+/', ' ', $lower);

        return trim((string) preg_replace('/\s+/', ' ', $spaced));
    }
}
