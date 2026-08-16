<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where an instance stands with its licence (#1290).
 *
 * A backed enum rather than a pair of booleans: "is it in trial" and "is it
 * licensed" invite a third state nobody handles, and the interesting question
 * is always which ONE of these applies.
 */
enum LicenseStatus: string
{
    /** Inside the free period that starts when the account is created. */
    case Trial = 'trial';

    /** A valid, unexpired key is activated. */
    case Active = 'active';

    /** The trial ran out, or the activated key's expiry has passed. */
    case Expired = 'expired';

    /**
     * May this instance change data?
     *
     * Reads always work — locking an owner out of their own athletes would
     * punish them for a billing state, and the data is on their machine.
     */
    public function allowsWrites(): bool
    {
        return $this !== self::Expired;
    }
}
