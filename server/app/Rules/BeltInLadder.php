<?php

declare(strict_types=1);

namespace App\Rules;

use App\Enums\Belt;
use App\Support\MartialArt\RankLadder;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The belt is one the academy's martial art awards (#1800).
 *
 * Paired with `Rule::enum(Belt::class)`, which says the value is a colour at
 * all; this says it is a colour *here* — a purple belt is a real colour and
 * not a judo grade. Silent on a value that is not a colour, so a typo gets one
 * error, not two.
 *
 * One rule for every door a belt comes in by: the athlete form, the edit, the
 * CSV import and the promotion backfill. A `viola` in a judo file is refused in
 * the import preview with the same reason the form would give.
 */
final class BeltInLadder implements ValidationRule
{
    public function __construct(private readonly RankLadder $ladder)
    {
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        $belt = \is_string($value) ? Belt::tryFrom($value) : null;
        if ($belt === null || $this->ladder->has($belt)) {
            return;
        }

        $fail("The {$belt->value} belt is not one this academy's martial art awards.");
    }
}
