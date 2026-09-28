<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * The sex as the athlete's document and codice fiscale record it (#1934).
 *
 * A registry field, not a gender-identity one: a federation card and the
 * competition categories read it off the document, and the codice fiscale
 * encodes it. The form labels it that way ("Sesso (come sul documento)").
 */
enum Sex: string
{
    case Male = 'm';
    case Female = 'f';
}
