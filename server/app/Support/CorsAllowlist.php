<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Parses the comma-separated `CORS_ALLOWED_ORIGINS` env value into a clean
 * list of origins. Whitespace is trimmed and empty entries are dropped, so
 * trailing commas or stray spaces in the env file don't end up as bogus
 * origins on the allowlist.
 *
 * Falls back to the Angular dev-server origin when the env is unset, so a
 * fresh local checkout works without any extra configuration.
 */
final class CorsAllowlist
{
    public const DEFAULT_DEV_ORIGIN = 'http://localhost:4200';

    /**
     * @return list<string>
     */
    public static function parse(?string $value): array
    {
        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) ($value ?? self::DEFAULT_DEV_ORIGIN)),
        )));
    }
}
