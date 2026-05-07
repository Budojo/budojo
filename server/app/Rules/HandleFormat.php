<?php

declare(strict_types=1);

namespace App\Rules;

use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Instagram-style handle validation rule (#479). The handle is the
 * `@matteo`-style globally-unique user identifier. Single failure code
 * (`handle_invalid_format`) collapses every rejection branch — the SPA
 * shows the rules verbatim under the input as helper text, so a
 * specific code per branch (`handle_too_short`, `handle_consecutive_
 * dots`, …) wouldn't add UX value worth the test surface.
 *
 * Rules:
 *
 * - 3-30 characters
 * - lowercase only — `[a-z0-9_.]` charset (the action lowercases input
 *   before save, but we still reject mixed-case at validation time so
 *   the client-side preview matches what's stored)
 * - must start with a letter (digit-leading or symbol-leading handles
 *   are both confusing — IG, Twitter, GitHub all enforce this)
 * - no consecutive dots (`mat..teo` is not a valid IG handle)
 * - no leading or trailing dot (a handle starts with a letter, ends
 *   with a `[a-z0-9_]` character)
 *
 * Uniqueness is enforced separately at the FormRequest layer
 * (`Rule::unique('users','handle')->ignore(...)`) plus the DB UNIQUE
 * index as the final backstop.
 */
class HandleFormat implements ValidationRule
{
    public const string FAILURE_CODE = 'handle_invalid_format';

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if (! \is_string($value)) {
            $fail(self::FAILURE_CODE);

            return;
        }

        // Length first — `mb_strlen` for unicode safety even though
        // the charset rule below disallows non-ASCII anyway.
        $length = mb_strlen($value);
        if ($length < 3 || $length > 30) {
            $fail(self::FAILURE_CODE);

            return;
        }

        // Charset + start-char in one regex: first char [a-z],
        // remaining 2-29 chars [a-z0-9._]. Anchored start-to-end.
        if (preg_match('/^[a-z][a-z0-9._]{2,29}$/', $value) !== 1) {
            $fail(self::FAILURE_CODE);

            return;
        }

        // No consecutive dots. The regex above lets `mat..teo`
        // through; this is the second pass.
        if (str_contains($value, '..')) {
            $fail(self::FAILURE_CODE);

            return;
        }

        // No trailing dot. Leading dot is already impossible (the
        // first char must be `[a-z]`).
        if (str_ends_with($value, '.')) {
            $fail(self::FAILURE_CODE);
        }
    }
}
