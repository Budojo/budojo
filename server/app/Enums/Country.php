<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * ISO 3166-1 alpha-2 country code. Italy-only for MVP (#72) — the column is
 * sized for the standard 2-char width, so adding a country here is a code
 * change without a schema change.
 *
 * The reason this is an enum at all (rather than a free string) is to keep
 * country-conditional validation rules — postal code regex, province enum
 * applicability — type-safe at the call site. When a third country is added,
 * a `match($this)` somewhere will scream until it covers the new case.
 */
enum Country: string
{
    case IT = 'IT';
}
