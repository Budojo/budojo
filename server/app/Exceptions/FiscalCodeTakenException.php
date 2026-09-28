<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\Athlete;

/**
 * Restoring this athlete would put a second live row on the roster with the
 * same codice fiscale (#1934) — they were deleted, re-created by hand, and
 * the old row asked back. Both rows would then fail the unique rule on every
 * save, because the form always sends the code. Rendered as a 422 by the
 * controller, naming the athlete who holds the code now.
 */
class FiscalCodeTakenException extends \RuntimeException
{
    public function __construct(public readonly Athlete $holder)
    {
        parent::__construct("{$holder->first_name} {$holder->last_name}, on the roster, already has this codice fiscale.");
    }
}
