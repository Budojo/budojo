<?php

declare(strict_types=1);

namespace App\Rules;

use App\Enums\Capability;
use App\Services\PwnedPasswordsClient;
use App\Support\Capabilities;
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
 * `app(PasswordNotBreached::class)` inside `rules()`. The rule itself
 * is resolved fresh per FormRequest (Laravel's validator infra
 * expects each rule instance to be transient), but the underlying
 * `PwnedPasswordsClient` IS bound as a singleton in
 * `AppServiceProvider::register()`, so its in-memory state + the
 * shared `Cache::*` layer ARE reused across all four entry points
 * (Register, Reset, ChangePassword, AcceptAthleteInvitation).
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

        // The range check needs outbound HTTPS. A runtime that has no business
        // phoning out (#1229 — the offline desktop) skips it rather than
        // logging a TLS failure on every registration.
        if (Capabilities::lacks(Capability::PasswordBreachCheck)) {
            return;
        }

        if ($this->client->isPwned($value)) {
            $fail(self::FAILURE_CODE);
        }
    }
}
