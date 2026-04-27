<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\Country;
use App\Enums\ItalianProvince;
use Illuminate\Validation\Rule;

/**
 * Shared address-payload validation rules (#72), reused across every
 * FormRequest that accepts a structured address — academy (#72a) and
 * athlete (#72b) today, instructor / event-venue tomorrow.
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
            // `min:1` is what makes the nested `required_with:address` rules
            // bite. Without it, a payload like `{"address": {}}` would pass
            // the parent rule (it's a valid array) AND the nested rules
            // (Laravel's `required_with` doesn't fire for an empty array
            // because the parent has no value to anchor to), letting an
            // address row through with every required field null. The `min:1`
            // forces the array to carry at least one key, which makes the
            // parent "non-empty" and triggers the inner `required_with`s.
            'address' => ['nullable', 'array', 'min:1'],
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
