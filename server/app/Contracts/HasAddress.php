<?php

declare(strict_types=1);

namespace App\Contracts;

use Illuminate\Database\Eloquent\Relations\MorphOne;

/**
 * Marker contract (#72b) for any model that owns at most one polymorphic
 * `Address`. The interface lets shared services like `SyncAddressAction`
 * accept an owner without a giant `Academy|Athlete|Instructor` union, and
 * makes the relation contract greppable when adding a third implementor.
 *
 * The interface signature deliberately omits `MorphOne`'s generic
 * parameters: PHPStan would otherwise refuse the implementations'
 * precise `<Address, $this>` return as incompatible (LSP-style variance).
 * Each implementor (Academy, Athlete) keeps the strict generic on its
 * own `address(): MorphOne` method for internal consumers; the few call
 * sites that touch this through `HasAddress` only need to know the method
 * exists and returns a relation builder.
 *
 * Implementors are typed as `HasAddress` AND `Model` together via
 * intersection at the call site (`HasAddress&Model`) so PHPStan picks up
 * methods like `setRelation()` and `unsetRelation()` from the model side.
 *
 * The 1:1 invariant is NOT enforced by this interface (or by `morphOne`).
 * It's enforced by the UNIQUE composite index on
 * `(addressable_type, addressable_id)` in the `addresses` table plus the
 * action's atomic `updateOrCreate(...)`. See `SyncAddressAction` for the
 * full discussion.
 */
interface HasAddress
{
    /** @phpstan-ignore missingType.generics */
    public function address(): MorphOne;
}
