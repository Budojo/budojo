<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * The languages the app speaks (#1912), as the SPA's language switch names
 * them. The server needs to know which one a user reads because it writes
 * their notifications — the inbox row and the Windows notification — itself.
 */
enum AppLocale: string
{
    case En = 'en';
    case It = 'it';
}
