<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * The academy's martial art has no starter programme yet (#1800). Its
 * registry lists none until the programme file ships, and the SPA does not
 * offer the button in that state; a client that asks anyway gets this,
 * rendered as a 404 — never a 500 from a file that does not exist.
 */
class SyllabusProgrammeUnavailableException extends \RuntimeException
{
    public function __construct()
    {
        parent::__construct('No starter programme has shipped for this martial art yet.');
    }
}
