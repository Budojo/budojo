<?php

declare(strict_types=1);

use App\Mail\AccountDeletionRequestedMail;
use App\Models\PendingDeletion;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;

beforeEach(function (): void {
    Mail::fake();
    Notification::fake();
});

it('queues an AccountDeletionRequestedMail to the user when deletion is requested', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'Password1!'])
        ->assertAccepted();

    Mail::assertQueued(AccountDeletionRequestedMail::class, function (
        AccountDeletionRequestedMail $mail,
    ) use ($user): bool {
        $row = PendingDeletion::query()->where('user_id', $user->id)->firstOrFail();

        return $mail->hasTo('mario@example.com')
            && $mail->user->id === $user->id
            && $mail->scheduledFor->isSameDay($row->scheduled_for);
    });
});

it('does NOT queue a second mail on idempotent re-request (matches firstOrCreate semantics)', function (): void {
    // RequestAccountDeletionAction uses firstOrCreate keyed on user_id —
    // a second POST returns the existing row without bumping the
    // grace window. The mail must mirror that idempotency: a user
    // who clicks "Delete account" repeatedly should NOT get a second
    // confirmation email or the inbox becomes a clue that something
    // is off (and the user has 30+ messages to delete).
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'Password1!'])
        ->assertAccepted();
    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'Password1!'])
        ->assertAccepted();
    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'Password1!'])
        ->assertAccepted();

    Mail::assertQueued(AccountDeletionRequestedMail::class, 1);
});

it('does NOT queue a mail when the deletion request fails password re-auth', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'WrongPassword!'])
        ->assertUnprocessable();

    Mail::assertNotQueued(AccountDeletionRequestedMail::class);
});

it('declares ShouldQueue so deletion confirmation does not block the request', function (): void {
    $user = User::factory()->make(['email' => 'mario@example.com']);
    $scheduledFor = Carbon::now()->addDays(30);

    $mail = new AccountDeletionRequestedMail($user, $scheduledFor);

    expect($mail)->toBeInstanceOf(\Illuminate\Contracts\Queue\ShouldQueue::class);
});

it('renders the mail content with the user name + scheduled deletion date', function (): void {
    $user = User::factory()->make(['name' => 'Mario Rossi', 'email' => 'mario@example.com']);
    $scheduledFor = Carbon::create(2026, 6, 15);

    $rendered = new AccountDeletionRequestedMail($user, $scheduledFor)->render();

    expect($rendered)->toContain('Mario Rossi');
    // Date must appear in the body — that's the load-bearing fact:
    // the user needs to know exactly when the data goes away to act
    // before the deadline. Match either dd/mm/yyyy or yyyy-mm-dd to
    // be locale-tolerant.
    expect($rendered)->toMatch('/15\\/06\\/2026|2026-06-15|June 15, 2026|15 June 2026/');
    expect($rendered)->toMatch('/budojo\\.it|localhost:4200/');
});

it('keeps deletion-request endpoint succeeding when the mail queue insert throws (atomicity)', function (): void {
    // Same atomicity rule as PR-B's WelcomeMail: the confirmation
    // mail is a side-effect of the deletion request, not a precondition.
    // A queue-side failure must NOT roll back the pending_deletions
    // row (the user EXPECTS their deletion request to be honored even
    // if our mailer is hiccuping) and must NOT surface a 500.
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('Password1!'),
    ]);

    Mail::shouldReceive('to')
        ->once()
        ->andThrow(new \RuntimeException('jobs-table insert failed'));

    $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'Password1!'])
        ->assertAccepted();

    expect(PendingDeletion::query()->where('user_id', $user->id)->exists())->toBeTrue();
});
