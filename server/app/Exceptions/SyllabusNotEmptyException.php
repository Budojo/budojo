<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * The shipped programme was asked for by an academy that already has topics
 * (#1563). Never overwritten: even one topic is a programme the academy owns.
 * Rendered as a 409 by the controller.
 */
class SyllabusNotEmptyException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('This academy already has a programme.');
    }
}
