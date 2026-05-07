<?php

declare(strict_types=1);

namespace App\Rules;

use App\Services\PwnedPasswordsClient;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Reject a password that appears in the HaveIBeenPwned breach dataset
 * (#415). Wraps `PwnedPasswordsClient` so the rule is a pure
 * validation surface — the HTTP client + cache logic stays in the
 * service layer, the rule is unit-testable with a fake.
 *
 * Single failure code (`password_breached`) so the SPA can render a
 * specific actionable message ("This password has appeared in known
 * data breaches — try a longer, less common one."). Soft-fail on
 * upstream outage is handled inside the client; if the client
 * returns false (clean OR API down), this rule passes.
 *
 * Constructor-injected via the framework container — call sites use
 * `app(PasswordNotBreached::class)` inside `rules()`. The same
 * instance is reused across the three entry points (Register,
 * Reset, Change) so the cache layer behind the client gets shared.
 */
class PasswordNotBreached implements ValidationRule
{
    public const string FAILURE_CODE = 'password_breached';

    public function __construct(private readonly PwnedPasswordsClient $client)
    {
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        // Defer non-string validation to the upstream `'string'` rule
        // in the FormRequest stack. We only check the breach dataset
        // when we've got a real string to hash.
        if (! \is_string($value) || $value === '') {
            return;
        }

        if ($this->client->isPwned($value)) {
            $fail(self::FAILURE_CODE);
        }
    }
}
