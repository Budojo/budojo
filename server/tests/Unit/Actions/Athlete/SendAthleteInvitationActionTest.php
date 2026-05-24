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

    // Pin the security-critical invariants of the queued mail:
    // (a) recipient matches the athlete's stored email — anti-
    // squatting boundary; (b) raw token in the body matches what
    // the Action returned — a regression that emailed the hash,
    // an empty string, or a stale token would still pass a bare
    // `assertQueued(class)` (#1022 reviewer).
    Mail::assertQueued(
        AthleteInvitationMail::class,
        fn (AthleteInvitationMail $mail): bool => $mail->hasTo('mario@example.com')
            && $mail->rawToken === $result['rawToken'],
    );
});

it('refuses to invite an email already registered as a user', function (): void {
    // Mail::fake() — belt-and-suspenders against a regression where
    // the action falls through to `Mail::queue(...)` instead of
    // throwing. Without it, a swallowed-throw bug would attempt a
    // real Resend dispatch from a unit test (flaky CI; on
    // `MAIL_MAILER` unset can crash the test process — gotchas §
    // Resend SDK). Also pins the absence of a queued mail on the
    // error path, which is part of the contract.
    Mail::fake();
    User::factory()->create(['email' => 'taken@example.com']);
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => 'taken@example.com']);

    // Pin the actual error key (PRD M7 PR-B contract), not just the
    // exception class — a regression to a generic 'invalid' would
    // pass on `toThrow(ValidationException::class)` alone.
    $action = app(SendAthleteInvitationAction::class);
    expect(fn () => $action->execute($owner, $athlete))
        ->toThrow(ValidationException::class, 'email_already_registered');

    Mail::assertNothingQueued();
});

it('throws when the athlete has no email on file', function (): void {
    // Same belt-and-suspenders as the email-already-registered case.
    Mail::fake();
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['email' => null]);

    // Pin the actual error key — same rationale as the
    // already-registered test above (#1022 reviewer).
    $action = app(SendAthleteInvitationAction::class);
    expect(fn () => $action->execute($owner, $athlete))
        ->toThrow(ValidationException::class, 'email_missing');

    Mail::assertNothingQueued();
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

    // The Action's docblock states resending ALWAYS queues mail
    // again — "the latest email is always the one that works".
    // Pin the side-effect: 2 distinct queued sends, each carrying
    // its own raw token. A regression that skips the second
    // `Mail::queue(...)` would let the SPA "Invita" button look
    // successful while the athlete never receives the new link.
    Mail::assertQueued(AthleteInvitationMail::class, 2);
    Mail::assertQueued(
        AthleteInvitationMail::class,
        fn (AthleteInvitationMail $mail): bool => $mail->rawToken === $firstResult['rawToken'],
    );
    Mail::assertQueued(
        AthleteInvitationMail::class,
        fn (AthleteInvitationMail $mail): bool => $mail->rawToken === $secondResult['rawToken'],
    );
});
