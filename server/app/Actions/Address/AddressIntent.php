<?php

declare(strict_types=1);

namespace App\Actions\Address;

/**
 * Three-way PATCH semantics for the polymorphic `address` morph (#72b).
 *
 * The HTTP layer distinguishes three caller intents on `address`:
 *
 * - **skip** — key absent on the request body. The existing row, if
 *   any, is preserved.
 * - **clear** — key present, value `null`. The morph row is deleted.
 * - **set** — key present, value is an array. The morph row is
 *   upserted (created or replaced in place).
 *
 * Carrying these three states as `bool + ?array` flag arguments is the
 * "two functions in a trench coat" pattern (Clean Code § flag args).
 * This value object collapses them into one parameter so the calling
 * code reads its intent at the construction site instead of decoding
 * a boolean elsewhere.
 */
final readonly class AddressIntent
{
    /**
     * @param array<string, mixed>|null $payload
     */
    private function __construct(
        public bool $present,
        public ?array $payload,
    ) {
    }

    public static function skip(): self
    {
        return new self(false, null);
    }

    public static function clear(): self
    {
        return new self(true, null);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function set(array $payload): self
    {
        return new self(true, $payload);
    }

    /**
     * Convenience builder for the FormRequest-typed wire shape: maps
     * the validated payload's `address` slot to the matching intent.
     *
     * @param array<string, mixed> $validated  full validated payload (key may be absent)
     */
    public static function fromValidated(array $validated): self
    {
        if (! \array_key_exists('address', $validated)) {
            return self::skip();
        }
        $value = $validated['address'];
        if (\is_array($value)) {
            /** @var array<string, mixed> $value */
            return self::set($value);
        }

        return self::clear();
    }
}
