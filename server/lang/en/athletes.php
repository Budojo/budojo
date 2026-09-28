<?php

declare(strict_types=1);

/*
 * The athlete record's own validation messages (#2006), in the language the
 * owner reads (`users.locale`), as the promotion history's are (#1991, #2002).
 * A message Laravel writes for a shape rule stays as it is.
 */
return [
    'fiscal_code' => [
        'invalid' => 'The codice fiscale is not valid: check it against the document.',
        'birth_date' => 'The codice fiscale says the date of birth is :date.',
        'sex' => 'The codice fiscale says the sex is :encoded, not :given.',
        'taken' => 'Another athlete of this academy already has this codice fiscale.',
        'same_in_file' => 'Row :row of this file has the same codice fiscale.',
    ],
];
