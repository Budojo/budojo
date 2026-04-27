<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy\Concerns;

use App\Enums\Country;
use App\Enums\ItalianProvince;
use Illuminate\Validation\Rule;

/**
 * Shared address-payload validation rules (#72), reused across Store and
 * Update academy requests. Lives in `Academy\Concerns` for now because that's
 * the only owner today; promote to a top-level `Address\Concerns` namespace
 * the day athletes (or any other entity) start carrying addresses too.
 *
 * Wire shape — nested object on the request body:
 *
 *     {
 *       "address": {
 *         "line1": "Via Roma 1",
 *         "line2": null,
 *         "city": "Roma",
 *         "postal_code": "00100",
 *         "province": "RM",
 *         "country": "IT"
 *       }
 *     }
 *
 * Three semantics on PATCH:
 *   - `address` absent → no change
 *   - `address: null` → clear the existing address (delete the row)
 *   - `address: { ... }` → upsert (create or replace the morph row)
 *
 * `required_with:address` on each nested field is what enforces "all-or-
 * nothing": once the parent key is present and non-null, every inner field
 * (except `line2`) must be filled. Laravel's nested-rule resolver handles
 * the `address: null` case by skipping the inner rules — no manual guard
 * needed.
 */
trait ValidatesAddress
{
    /**
     * @return array<string, mixed>
     */
    protected function addressRules(): array
    {
        return [
            'address' => ['nullable', 'array'],
            'address.line1' => ['required_with:address', 'string', 'max:255'],
            'address.line2' => ['nullable', 'string', 'max:255'],
            'address.city' => ['required_with:address', 'string', 'max:100'],
            // IT MVP — five-digit CAP. The regex stays here (rather than in
            // an enum or domain class) because postal-code formats are tied
            // to the country sibling field; expanding to non-IT countries
            // means a `match($country)` inside `withValidator()` rather than
            // a static rule.
            'address.postal_code' => ['required_with:address', 'string', 'regex:/^\d{5}$/'],
            'address.province' => ['required_with:address', Rule::enum(ItalianProvince::class)],
            'address.country' => ['required_with:address', Rule::enum(Country::class)],
        ];
    }
}
