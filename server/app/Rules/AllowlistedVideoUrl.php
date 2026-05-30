<?php

declare(strict_types=1);

namespace App\Rules;

use App\Enums\VideoProvider;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Validates that a shared-video URL points at an allowlisted provider host
 * (#1154) — Instagram / YouTube / TikTok. This is the user-facing 422 guard;
 * the resolver re-checks the same allowlist as the SSRF backstop.
 */
final class AllowlistedVideoUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if (! \is_string($value)) {
            $fail('The :attribute must be a valid video link.');

            return;
        }

        $host = parse_url($value, PHP_URL_HOST);
        if (! \is_string($host) || VideoProvider::fromHost($host) === null) {
            $fail('The :attribute must be an Instagram, YouTube, or TikTok link.');
        }
    }
}
