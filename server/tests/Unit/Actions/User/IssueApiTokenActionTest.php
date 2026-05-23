<?php

declare(strict_types=1);

use App\Actions\User\IssueApiTokenAction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('mints a token and stamps kind=api on the happy path (#994)', function (): void {
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

it('rolls back the createToken row when the kind stamp throws — atomicity invariant (#995 reviewer)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $countBefore = DB::table('personal_access_tokens')->count();

    // Hook into the query lifecycle just before the `kind` UPDATE
    // executes and throw, simulating a downstream failure between
    // create + stamp. The DB::transaction() in the Action MUST
    // rollback the freshly-inserted token row — otherwise the SPA's
    // `/me/sessions` would surface a token marked `session` (the
    // default) and the "revoke other sessions" sweep could wipe it.
    DB::beforeExecuting(function (string $query): void {
        if (str_starts_with(strtolower($query), 'update "personal_access_tokens" set "kind"')) {
            throw new \RuntimeException('simulated kind-stamp failure');
        }
    });

    $action = new IssueApiTokenAction();

    expect(fn () => $action->execute(
        user: $user,
        name: 'should-rollback',
        abilities: ['athletes:read'],
        expiresInDays: null,
    ))->toThrow(\RuntimeException::class, 'simulated kind-stamp failure');

    expect(DB::table('personal_access_tokens')->count())->toBe($countBefore);
});

it('honours expires_in_days with a frozen clock', function (): void {
    Carbon::setTestNow('2026-05-23 12:00:00');

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
    expect($newToken->accessToken->expires_at->toDateTimeString())
        ->toBe('2026-05-30 12:00:00');
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
