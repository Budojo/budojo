<?php

declare(strict_types=1);

use App\Actions\User\IssueApiTokenAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('mints a token and stamps kind=api atomically (#994)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $action = new IssueApiTokenAction();
    $newToken = $action->execute(
        user: $user,
        name: 'nightly-export',
        abilities: ['athletes:read'],
        expiresInDays: null,
    );

    expect($newToken->plainTextToken)->toBeString()->not->toBe('');
    expect($newToken->accessToken->name)->toBe('nightly-export');
    expect($newToken->accessToken->getAttribute('kind'))->toBe('api');
    // No expiry when null was passed.
    expect($newToken->accessToken->expires_at)->toBeNull();
});

it('honours expires_in_days when set', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $action = new IssueApiTokenAction();
    $newToken = $action->execute(
        user: $user,
        name: 'temporary',
        abilities: ['athletes:read'],
        expiresInDays: 7,
    );

    expect($newToken->accessToken->expires_at)->not->toBeNull();
    // Allow 5s of clock-skew between now() in this test and now() in
    // the Action's `now()->addDays(...)`.
    $expectedAt = now()->addDays(7);
    expect($newToken->accessToken->expires_at->diffInSeconds($expectedAt))
        ->toBeLessThan(5);
});

it('persists all the abilities exactly as supplied', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $action = new IssueApiTokenAction();
    $newToken = $action->execute(
        user: $user,
        name: 'multi-ability',
        abilities: ['athletes:read', 'documents:read'],
        expiresInDays: null,
    );

    expect($newToken->accessToken->abilities)
        ->toBe(['athletes:read', 'documents:read']);
});
