<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\NotificationActor;

it('builds the actor block from a user — full name + avatar url', function (): void {
    $user = User::factory()->make(['first_name' => 'Marco', 'last_name' => 'Rossi']);

    expect(NotificationActor::fromUser($user))->toBe([
        'name' => 'Marco Rossi',
        'avatar_url' => null,
    ]);
});

it('trims the name when a part is blank', function (): void {
    $user = User::factory()->make(['first_name' => 'Marco', 'last_name' => '']);

    expect(NotificationActor::fromUser($user)['name'])->toBe('Marco');
});
