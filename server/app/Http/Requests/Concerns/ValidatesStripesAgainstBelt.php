<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\Belt;
use App\Models\Athlete;
use Illuminate\Contracts\Validation\Validator;

/**
 * Cross-field rule (#229): the `stripes` value must not exceed the
 * `Belt::maxStripes()` cap for the SELECTED belt. Black is the only
 * belt that allows graus 1°-6° (i.e. 0-6 stripes); every other belt
 * caps at 0-4. The static `min:0|max:6` rule on the FormRequest is
 * the global ceiling; this trait enforces the per-belt sub-cap in
 * `withValidator()`.
 *
 * On Store: the request always carries `belt` (it's required), so the
 * resolution is direct.
 *
 * On Update: belt may be absent from a partial payload. We fall back
 * to the existing athlete row from the route binding so a PUT touching
 * only `stripes` is still validated against the persisted belt.
 *
 * Extracted from StoreAthleteRequest + UpdateAthleteRequest to drop a
 * fully duplicated method body — the original implementations differed
 * only in the source of the resolved belt.
 */
trait ValidatesStripesAgainstBelt
{
    protected function validateStripesAgainstBelt(Validator $validator): void
    {
        if (! $this->has('stripes')) {
            return;
        }

        $belt = $this->resolveBeltForStripesCap();
        if ($belt === null) {
            return;
        }

        $stripes = $this->integer('stripes');
        $max = $belt->maxStripes();

        if ($stripes > $max) {
            $validator->errors()->add(
                'stripes',
                "The {$belt->value} belt allows at most {$max} stripes.",
            );
        }
    }

    /**
     * Pulls the belt to validate against, in priority order:
     *   1. The `belt` field in the current request (always present on
     *      Store, sometimes-present on Update);
     *   2. The existing athlete bound to the route (Update only).
     *
     * Returns null only when neither source resolves — e.g. a Store
     * payload missing `belt` entirely, in which case the standard
     * `Rule::enum(Belt::class)` rule already fails with a separate
     * error and this check correctly stays silent.
     */
    private function resolveBeltForStripesCap(): ?Belt
    {
        $beltValue = $this->input('belt');
        if (\is_string($beltValue)) {
            $belt = Belt::tryFrom($beltValue);
            if ($belt !== null) {
                return $belt;
            }
        }

        $athlete = $this->route('athlete');

        return $athlete instanceof Athlete ? $athlete->belt : null;
    }
}
