<?php

declare(strict_types=1);

use App\Mail\EmailChangeNotificationMail;
use App\Mail\EmailChangeVerificationMail;
use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    Mail::fake();
});

it('persists a pending row + queues both verification and notification mails', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'email' => 'old@example.com',
    ]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'new@example.com'])
        ->assertStatus(202)
        ->assertJsonPath('message', 'verification_link_sent');

    expect(PendingEmailChange::query()->count())->toBe(1);

    /** @var PendingEmailChange $pending */
    $pending = PendingEmailChange::query()->first();
    expect($pending->user_id)->toBe($user->id);
    expect($pending->new_email)->toBe('new@example.com');
    // Token is hashed at rest.
    expect($pending->token)->toMatch('/^[a-f0-9]{64}$/');
    expect($pending->isExpired())->toBeFalse();

    // Live `users.email` is unchanged — pending-then-verify, NOT
    // apply-then-verify.
    $user->refresh();
    expect($user->email)->toBe('old@example.com');

    Mail::assertQueued(EmailChangeVerificationMail::class, function (EmailChangeVerificationMail $mail): bool {
        expect($mail->hasTo('new@example.com'))->toBeTrue();
        // Raw token only ever lives on the Mailable for URL stitching.
        expect(strlen($mail->rawToken))->toBe(64);

        return true;
    });
    Mail::assertQueued(EmailChangeNotificationMail::class, function (EmailChangeNotificationMail $mail): bool {
        expect($mail->hasTo('old@example.com'))->toBeTrue();
        // Defence in depth: the new email is NEVER carried verbatim
        // back to the OLD inbox.
        expect($mail->newEmailPartial)->not->toContain('new@example.com');

        return true;
    });
});

it('rejects with 422 email_taken when the candidate is already a different user', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    User::factory()->create(['email' => 'taken@example.com']);

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'taken@example.com'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email']);

    expect(PendingEmailChange::query()->count())->toBe(0);
    Mail::assertNothingQueued();
});

it('rejects with 422 email_unchanged when the candidate equals the current email', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'email' => 'mario@example.com',
    ]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'mario@example.com'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email']);

    expect(PendingEmailChange::query()->count())->toBe(0);
    Mail::assertNothingQueued();
});

it('replaces the pending row on a fresh request (UNIQUE(user_id))', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'first@example.com'])
        ->assertStatus(202);

    /** @var PendingEmailChange $original */
    $original = PendingEmailChange::query()->firstOrFail();

    // Wait a beat so updated_at moves; without travel the mock-clock-
    // identical updated_at can hide a real bug where the row never
    // got refreshed.
    $this->travel(1)->seconds();

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'second@example.com'])
        ->assertStatus(202);

    expect(PendingEmailChange::query()->count())->toBe(1);

    /** @var PendingEmailChange $refreshed */
    $refreshed = PendingEmailChange::query()->firstOrFail();
    expect($refreshed->id)->toBe($original->id);
    expect($refreshed->new_email)->toBe('second@example.com');
    expect($refreshed->token)->not->toBe($original->token);
});

it('throttles at 5 requests per hour per user', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    for ($i = 0; $i < 5; $i++) {
        $this->actingAs($user)
            ->postJson('/api/v1/me/email-change', ['email' => "candidate-{$i}@example.com"])
            ->assertStatus(202);
    }

    $this->actingAs($user)
        ->postJson('/api/v1/me/email-change', ['email' => 'sixth@example.com'])
        ->assertStatus(429);
});

it('rejects unauthenticated requests with 401', function (): void {
    $this->postJson('/api/v1/me/email-change', ['email' => 'whoever@example.com'])
        ->assertStatus(401);

    expect(PendingEmailChange::query()->count())->toBe(0);
    Mail::assertNothingQueued();
});

it('DELETE /me/email-change drops the pending row idempotently', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    PendingEmailChange::factory()->create([
        'user_id' => $user->id,
    ]);

    $this->actingAs($user)
        ->deleteJson('/api/v1/me/email-change')
        ->assertNoContent();

    expect(PendingEmailChange::query()->where('user_id', $user->id)->count())->toBe(0);

    // Idempotent — second call against an already-empty state still
    // returns 204.
    $this->actingAs($user)
        ->deleteJson('/api/v1/me/email-change')
        ->assertNoContent();
});

it('exposes the pending block on /auth/me when one is outstanding', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    PendingEmailChange::factory()->create([
        'user_id' => $user->id,
        'new_email' => 'jdoe@example.com',
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/auth/me');

    $response
        ->assertOk()
        ->assertJsonPath('data.pending_email_change.new_email_partial', 'j***@e***.com')
        ->assertJsonStructure(['data' => ['pending_email_change' => ['expires_at']]]);
});

afterEach(function (): void {
    RateLimiter::clear('email-change-request');
});
