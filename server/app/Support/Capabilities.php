<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\Capability;

/**
 * Resolves the capability set of the active runtime profile from
 * `config/budojo.php`. One place; everything else asks `has()`.
 */
final class Capabilities
{
    /**
     * @return list<Capability>
     */
    public static function all(): array
    {
        /** @var array<string, list<string>> $map */
        $map = config('budojo.capabilities', []);
        $names = $map[Runtime::profile()->value] ?? [];

        $capabilities = [];

        foreach ($names as $name) {
            $capability = Capability::tryFrom($name);

            if ($capability !== null) {
                $capabilities[] = $capability;
            }
        }

        return $capabilities;
    }

    public static function has(Capability $capability): bool
    {
        return \in_array($capability, self::all(), true);
    }

    public static function lacks(Capability $capability): bool
    {
        return ! self::has($capability);
    }
}
