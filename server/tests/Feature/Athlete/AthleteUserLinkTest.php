<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;

it('links an athlete row to a user via athletes.user_id (HasOne on User side)', function (): void {
    // Arrange: an academy with one athlete, plus a separate user
    // representing the athlete's own login (created by the M7 invite
    // flow in PR-C; here we just emulate the post-accept state).
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'user_id' => $athleteUser->id,
    ]);

    // Act + Assert: both sides of the relation hydrate.
    expect($athlete->user)->not->toBeNull();
    expect($athlete->user->id)->toBe($athleteUser->id);

    expect($athleteUser->athlete)->not->toBeNull();
    expect($athleteUser->athlete->id)->toBe($athlete->id);
});

it('an owner user has no linked athlete (HasOne returns null)', function (): void {
    $owner = User::factory()->create();

    expect($owner->isOwner())->toBeTrue();
    expect($owner->athlete)->toBeNull();
});

it('enforces unique athletes.user_id (HasOne invariant — one user → at most one athlete)', function (): void {
    // Two athletes pointing at the same user_id would silently
    // break `User::athlete()` — the HasOne could return either row.
    // The UNIQUE index on athletes.user_id is the schema-level
    // guard, asserted here so a future migration accidentally
    // dropping it trips this test.
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create();

    Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]);

    expect(fn () => Athlete::factory()->for($academy)->create(['user_id' => $athleteUser->id]))
        ->toThrow(\Illuminate\Database\UniqueConstraintViolationException::class);
});

it('null-sets athletes.user_id when the linked user is deleted (no cascade)', function (): void {
    // The FK is configured `nullOnDelete()` so a user being deleted
    // (e.g. GDPR Art. 17 hard-delete) does NOT take the athlete row
    // with them — the athlete record survives, the link clears, and
    // the owner can re-invite the same email.
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'user_id' => $athleteUser->id,
    ]);

    $athleteUser->delete();

    $athlete->refresh();
    expect($athlete->user_id)->toBeNull();
    // Soft-deleted? No — Athletes use SoftDeletes for owner-side
    // delete, not for cascading-from-user. The row stays alive.
    expect($athlete->trashed())->toBeFalse();
});
