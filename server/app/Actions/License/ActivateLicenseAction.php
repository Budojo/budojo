<?php

declare(strict_types=1);

namespace App\Actions\License;

use App\Models\License;
use App\Support\LicenseState;

/**
 * Record an activation key and report the resulting state (#1290).
 *
 * The key has already been proven genuine and unexpired by `ValidLicenseKey` at
 * the validation layer, so this Action does exactly one thing: it writes the
 * activation down. The resulting state is then re-derived from storage rather
 * than assembled here, so what the caller is told is what any later request
 * will read back.
 */
class ActivateLicenseAction
{
    public function __construct(private readonly GetLicenseStateAction $state)
    {
    }

    public function execute(string $key): LicenseState
    {
        License::query()->create([
            'key' => trim($key),
            'activated_at' => now(),
        ]);

        return $this->state->execute();
    }
}
