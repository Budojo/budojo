<?php

declare(strict_types=1);

namespace App\Enums;

/** One step through an ordered list, towards its start or its end (#1661). */
enum MoveDirection: string
{
    case Up = 'up';
    case Down = 'down';
}
