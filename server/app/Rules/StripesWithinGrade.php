<?php

declare(strict_types=1);

namespace App\Rules;

use App\Enums\Belt;
use App\Support\MartialArt\RankLadder;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A stripe count within the cap of its grade in the academy's ladder (#1800):
 * 6 on a BJJ black, 4 on a FIJLKAM black (shown 1st–5th dan), 0 on a judo
 * green. The `max:10` next to it is only the ceiling across every ladder.
 *
 * One rule for every door stripes come in by — the athlete form, the edit,
 * the CSV import and the promotion backfill — because they used to be three
 * copies, and the copies disagreed: the import had none at all, and the form's
 * ran outside the validator's `after()` hook, where `passes()` threw its error
 * away. A `ValidationRule` runs inside validation, so neither can happen.
 *
 * The belt is read from `$beltField` in the same payload; when that is absent
 * (an edit sending only `stripes`) the caller passes the belt already stored.
 * A value that is not a known colour, or a colour outside the ladder, is left
 * to the enum rule and `BeltInLadder`: one error per mistake.
 */
final class StripesWithinGrade implements DataAwareRule, ValidationRule
{
    /** @var array<string, mixed> */
    private array $data = [];

    public function __construct(
        private readonly RankLadder $ladder,
        private readonly string $beltField = 'belt',
        private readonly ?Belt $storedBelt = null,
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if (! is_numeric($value)) {
            return; // `integer` reports it
        }

        $sent = $this->data[$this->beltField] ?? null;
        $belt = (\is_string($sent) ? Belt::tryFrom($sent) : null) ?? $this->storedBelt;
        $max = $belt === null ? null : $this->ladder->maxStripes($belt);

        if ($belt !== null && $max !== null && (int) $value > $max) {
            $fail("The {$belt->value} belt allows at most {$max} stripes.");
        }
    }
}
