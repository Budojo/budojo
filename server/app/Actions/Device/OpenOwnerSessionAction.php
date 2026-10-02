<?php

declare(strict_types=1);

namespace App\Actions\Device;

use App\Actions\Auth\MintSessionTokenAction;
use App\Enums\UserRole;
use App\Models\User;

/**
 * The owner's session on a local device, with no password (#2079, PRD § 5.4):
 * the Google account is the key, and the device is the owner's. Only the
 * shell's own page can ask (`RequireShell`).
 *
 * A local device holds one academy and one owner; the first owner by id is
 * the one a restored backup or this device's own setup made.
 */
final class OpenOwnerSessionAction
{
    public function __construct(private readonly MintSessionTokenAction $mintToken)
    {
    }

    /** @return array{user: User, token: string}|null null when the device has no owner yet */
    public function execute(string $deviceLabel): ?array
    {
        $owner = User::query()->where('role', UserRole::Owner->value)->orderBy('id')->first();
        if ($owner === null) {
            return null;
        }

        return ['user' => $owner, 'token' => $this->mintToken->execute($owner, $deviceLabel)];
    }
}
