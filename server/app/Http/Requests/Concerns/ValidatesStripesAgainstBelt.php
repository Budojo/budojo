<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\Belt;
use App\Models\Athlete;
use Illuminate\Contracts\Validation\Validator;

/**
 * Cross-field rule (#229, #1800): the `stripes` value must not exceed the cap
 * of the SELECTED belt in the academy's ladder — 6 on a BJJ black, 4 on a
 * FIJLKAM black (1st-5th dan), 0 on a judo green. The static `max:10` rule on
 * the FormRequest is the global ceiling; this trait enforces the per-grade cap
 * in `withValidator()`. A belt outside the ladder is `BeltInLadder`'s error,
 * not this one's.
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
    use ResolvesRankLadder;

    protected function validateStripesAgainstBelt(Validator $validator): void
    {
        // Inside `after()`, never straight onto `errors()`: `passes()` starts
        // from a fresh MessageBag, so an error added before validation runs is
        // thrown away. Until #1800 this check did exactly that, and the cap
        // was enforced only by the SPA's picker.
        $validator->after(function (Validator $validator): void {
            if (! $this->has('stripes')) {
                return;
            }

            $belt = $this->resolveBeltForStripesCap();
            if ($belt === null) {
                return;
            }

            $stripes = $this->integer('stripes');
            $max = $this->rankLadder()->maxStripes($belt);

            if ($max !== null && $stripes > $max) {
                $validator->errors()->add(
                    'stripes',
                    "The {$belt->value} belt allows at most {$max} stripes.",
                );
            }
        });
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
