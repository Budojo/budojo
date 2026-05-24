<?php

declare(strict_types=1);

use App\Actions\Athlete\SendAthleteInvitationAction;
use App\Mail\AthleteInvitationMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

it('creates a pending invitation + queues mail with the raw token (#1021)', function (): void {
    Mail::fake();
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => 'mario@example.com']);

    $action = app(SendAthleteInvitationAction::class);
    $result = $action->execute($owner, $athlete);

    expect($result)->toBeArray();
    expect($result['rawToken'])->toBeString()->toHaveLength(64);

    // DB row: token column carries the SHA-256 hash, NOT the raw.
    $row = AthleteInvitation::query()->where('athlete_id', $athlete->id)->firstOrFail();
    expect($row->token)->toBe(AthleteInvitation::hashToken($result['rawToken']));
    expect($row->email)->toBe('mario@example.com');
    expect($row->sent_by_user_id)->toBe($owner->id);

    Mail::assertQueued(AthleteInvitationMail::class);
});

it('refuses to invite an email already registered as a user', function (): void {
    User::factory()->create(['email' => 'taken@example.com']);
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => 'taken@example.com']);

    $action = app(SendAthleteInvitationAction::class);
    expect(fn () => $action->execute($owner, $athlete))
        ->toThrow(ValidationException::class);
});

it('throws when the athlete has no email on file', function (): void {
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => null]);

    $action = app(SendAthleteInvitationAction::class);
    expect(fn () => $action->execute($owner, $athlete))
        ->toThrow(ValidationException::class);
});

it('re-sending replaces the token on an existing pending row (no duplicate live tokens)', function (): void {
    Mail::fake();
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => 'mario@example.com']);

    $action = app(SendAthleteInvitationAction::class);

    $firstResult = $action->execute($owner, $athlete);
    $secondResult = $action->execute($owner, $athlete);

    // Two distinct raw tokens were emitted...
    expect($secondResult['rawToken'])->not->toBe($firstResult['rawToken']);

    // ...but only ONE pending row exists. Re-send updates in-place
    // instead of creating a parallel row — closes the bearer-credential
    // duplication footgun.
    $count = AthleteInvitation::query()->where('athlete_id', $athlete->id)->count();
    expect($count)->toBe(1);

    // The DB row reflects the SECOND token's hash (latest send wins).
    $row = AthleteInvitation::query()->where('athlete_id', $athlete->id)->firstOrFail();
    expect($row->token)->toBe(AthleteInvitation::hashToken($secondResult['rawToken']));
});
