<?php

declare(strict_types=1);

/*
 * The athlete record's own validation messages (#2006), in the language the
 * owner reads (`users.locale`), as the promotion history's are (#1991, #2002).
 * A message Laravel writes for a shape rule stays as it is.
 */
return [
    'fiscal_code' => [
        'invalid' => 'Il codice fiscale non è valido: controllalo sul documento.',
        'birth_date' => 'Il codice fiscale dice che la data di nascita è il :date.',
        'sex' => 'Il codice fiscale dice che il sesso è :encoded, non :given.',
        'taken' => 'Un altro atleta di questa accademia ha già questo codice fiscale.',
        'same_in_file' => 'La riga :row di questo file ha lo stesso codice fiscale.',
    ],
];
