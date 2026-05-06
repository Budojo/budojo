<?php

declare(strict_types=1);

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('emits role on the wire envelope so the SPA can branch the redirect', function (): void {
    /** @var User $owner */
    $owner = User::factory()->create();

    $resource = new UserResource($owner);
    /** @var array<string, mixed> $array */
    $array = $resource->toArray(request());

    expect($array)->toHaveKey('role');
    expect($array['role'])->toBe('owner');
});

it('emits role=athlete for invited users', function (): void {
    /** @var User $athlete */
    $athlete = User::factory()->athlete()->create();

    $resource = new UserResource($athlete);
    /** @var array<string, mixed> $array */
    $array = $resource->toArray(request());

    expect($array['role'])->toBe('athlete');
});

it('the /auth/me endpoint surfaces role for the bootstrap call', function (): void {
    $user = User::factory()->athlete()->create();

    $this->actingAs($user)
        ->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.role', 'athlete');
});
