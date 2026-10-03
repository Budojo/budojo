<?php

declare(strict_types=1);

namespace App\Support\Sync;

/**
 * The homecoming («il rientro», PRD § 6.2, #2039): what the other device's
 * work brought, in counts, until the owner has seen it. Beside the live
 * database as `<database>.homecoming`, **never in it**: the database travels
 * to the other device, and this is this device's news alone.
 *
 * Two pulls before the owner looks add up (`RecordHomecomingAction`).
 *
 * @phpstan-type Arrived array{
 *     device: string,
 *     at: string,
 *     through: string,
 *     attendance: list<array{lesson: string|null, count: int}>,
 *     payments: array{count: int, amount_cents: int},
 *     athletes: int,
 *     promotions: int,
 *     other: int,
 * }
 */
final class Homecoming
{
    public static function path(): string
    {
        return SyncDatabase::path() . '.homecoming';
    }

    /** @return Arrived|null */
    public static function read(): ?array
    {
        $path = self::path();
        if (! file_exists($path)) {
            return null;
        }
        $value = json_decode((string) file_get_contents($path), true);
        if (! \is_array($value) || ! \is_string($value['through'] ?? null)) {
            throw new \RuntimeException("the homecoming at {$path} does not read");
        }

        /** @var Arrived $value */
        return $value;
    }

    /**
     * Written beside and renamed: a start that dies halfway leaves the
     * homecoming before or after, never half of one.
     *
     * @param  Arrived  $arrived
     */
    public static function keep(array $arrived): void
    {
        $path = self::path();
        $part = "{$path}.part";
        if (file_put_contents($part, json_encode($arrived, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)) === false || ! rename($part, $path)) {
            @unlink($part);

            throw new \RuntimeException('could not keep the homecoming');
        }
    }

    /**
     * The owner has seen it, through `$through`: a pull that added to it since
     * keeps it, for the owner to see that too.
     */
    public static function seen(string $through): void
    {
        $kept = self::read();
        if ($kept !== null && $kept['through'] === $through && ! unlink(self::path())) {
            throw new \RuntimeException('could not clear the homecoming the owner has seen');
        }
    }
}
