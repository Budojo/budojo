<?php

declare(strict_types=1);

namespace App\Enums;

enum AthleteStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Inactive = 'inactive';
}
