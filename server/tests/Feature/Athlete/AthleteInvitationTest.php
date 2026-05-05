<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;

it('persists an invitation with the lifecycle columns nullable by default', function (): void {
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();

    $invitation = AthleteInvitation::factory()
        ->for($athlete)
        ->for($academy)
        ->state(['sent_by_user_id' => $owner->id])
        ->create();

    expect($invitation->accepted_at)->toBeNull();
    expect($invitation->revoked_at)->toBeNull();
    expect($invitation->expires_at->isFuture())->toBeTrue();
    expect($invitation->isPending())->toBeTrue();
    expect($invitation->isAccepted())->toBeFalse();
    expect($invitation->isRevoked())->toBeFalse();
    expect($invitation->isExpired())->toBeFalse();
});

it('flags accepted / revoked / expired states correctly via helpers', function (): void {
    $accepted = AthleteInvitation::factory()->accepted()->create();
    $revoked = AthleteInvitation::factory()->revoked()->create();
    $expired = AthleteInvitation::factory()->expired()->create();

    expect($accepted->isAccepted())->toBeTrue();
    expect($accepted->isPending())->toBeFalse();

    expect($revoked->isRevoked())->toBeTrue();
    expect($revoked->isPending())->toBeFalse();

    expect($expired->isExpired())->toBeTrue();
    expect($expired->isPending())->toBeFalse();
});

it('the pending() scope returns only un-accepted, un-revoked, un-expired rows', function (): void {
    AthleteInvitation::factory()->create();              // pending
    AthleteInvitation::factory()->create();              // pending
    AthleteInvitation::factory()->accepted()->create();
    AthleteInvitation::factory()->revoked()->create();
    AthleteInvitation::factory()->expired()->create();

    expect(AthleteInvitation::query()->pending()->count())->toBe(2);
});

it('the expired() scope returns only past-expiry, un-accepted, un-revoked rows', function (): void {
    AthleteInvitation::factory()->create();              // pending
    AthleteInvitation::factory()->accepted()->create();
    AthleteInvitation::factory()->revoked()->create();
    AthleteInvitation::factory()->expired()->create();

    expect(AthleteInvitation::query()->expired()->count())->toBe(1);
});

it('exposes athlete + academy + sentBy relations', function (): void {
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();

    $invitation = AthleteInvitation::factory()
        ->for($athlete)
        ->for($academy)
        ->state(['sent_by_user_id' => $owner->id])
        ->create();

    expect($invitation->athlete->id)->toBe($athlete->id);
    expect($invitation->academy->id)->toBe($academy->id);
    expect($invitation->sentBy->id)->toBe($owner->id);
});

it('the invitations() relation on Athlete returns every history row', function (): void {
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();

    AthleteInvitation::factory()->for($athlete)->for($academy)->state(['sent_by_user_id' => $owner->id])->revoked()->create();
    AthleteInvitation::factory()->for($athlete)->for($academy)->state(['sent_by_user_id' => $owner->id])->expired()->create();
    AthleteInvitation::factory()->for($athlete)->for($academy)->state(['sent_by_user_id' => $owner->id])->create();

    expect($athlete->invitations()->count())->toBe(3);
    expect($athlete->invitations()->pending()->count())->toBe(1);
});

it('cascades to athlete_invitations when the parent athlete is deleted', function (): void {
    // Athletes use SoftDeletes — soft-deleting the parent does NOT
    // cascade to invitations (the FK has `cascadeOnDelete()` which
    // only fires on hard delete). This test forces the hard delete
    // path to verify the FK cascade behaves as documented.
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();
    AthleteInvitation::factory()
        ->for($athlete)
        ->for($academy)
        ->state(['sent_by_user_id' => $owner->id])
        ->count(2)
        ->create();

    expect(AthleteInvitation::query()->count())->toBe(2);

    $athlete->forceDelete();

    expect(AthleteInvitation::query()->count())->toBe(0);
});
