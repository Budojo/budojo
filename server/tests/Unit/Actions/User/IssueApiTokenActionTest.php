<?php

declare(strict_types=1);

use App\Actions\User\IssueApiTokenAction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

uses(RefreshDatabase::class);

afterEach(function (): void {
    // Reset the frozen clock so a later test in this file (or any
    // sibling) doesn't inherit a stale `now()`. Mirrors the
    // canonical pattern in tests/Feature/Audit/WriteAuditEntryTest.
    Carbon::setTestNow();
});

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

    // Hook into the model lifecycle just before the `kind` UPDATE
    // executes and throw, simulating a downstream failure between
    // create + stamp. The DB::transaction() in the Action MUST
    // rollback the freshly-inserted token row — otherwise the SPA's
    // `/me/sessions` would surface a token marked `session` (the
    // default) and the "revoke other sessions" sweep could wipe it.
    //
    // Why a model-event hook and NOT `DB::beforeExecuting`: an SQL
    // matcher would hard-code SQLite quote-chars and column-order,
    // both of which can shift (MySQL backticks, Sanctum override
    // ordering). The `updating` event fires after the INSERT from
    // `createToken()` and exactly on the `forceFill->save()` UPDATE
    // — DB-agnostic, column-order-agnostic, auto-reset between
    // PEST tests via the container rebuild.
    PersonalAccessToken::updating(function (): void {
        throw new \RuntimeException('simulated kind-stamp failure');
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
