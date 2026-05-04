<?php

declare(strict_types=1);

use App\Mail\WelcomeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

beforeEach(function (): void {
    Mail::fake();
});

it('queues a WelcomeMail to the new user when registration succeeds', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertCreated();

    Mail::assertQueued(WelcomeMail::class, fn (WelcomeMail $mail): bool => $mail->hasTo('mario@example.com')
            && $mail->user->email === 'mario@example.com'
            && $mail->user->name === 'Mario Rossi');
});

it('does not queue a WelcomeMail when registration validation fails', function (): void {
    // Validation failure short-circuits before the Action runs, so the
    // user is never created and no mail should be queued.
    $this->postJson('/api/v1/auth/register', [
        'name' => '',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertUnprocessable();

    Mail::assertNotQueued(WelcomeMail::class);
});

it('declares ShouldQueue so Mail::send is asynchronous in production', function (): void {
    // The Mailable MUST implement ShouldQueue — without it the mail
    // sends synchronously in the request thread, which adds Resend's
    // round-trip latency to every successful registration. The
    // queue:work daemon (Forge Daemons) processes it out-of-band.
    $mail = new WelcomeMail(
        User::factory()->make(['email' => 'mario@example.com', 'name' => 'Mario']),
    );

    expect($mail)->toBeInstanceOf(\Illuminate\Contracts\Queue\ShouldQueue::class);
});

it('renders the WelcomeMail content with the user name + a link to the SPA', function (): void {
    // Smoke-render the Mailable to catch typos in the blade template
    // / missing variable bindings. We don't pin specific copy strings
    // (those will change as the legal team or marketing edits the
    // template); we pin the load-bearing facts: user's name appears,
    // a link to the SPA root is present.
    $user = User::factory()->make(['name' => 'Mario Rossi', 'email' => 'mario@example.com']);

    $rendered = new WelcomeMail($user)->render();

    expect($rendered)->toContain('Mario Rossi');
    // The mail wraps a CTA link to the SPA root — the noAcademyGuard
    // redirects new users to /setup automatically, so a single
    // root-level link is correct regardless of onboarding state.
    expect($rendered)->toMatch('/budojo\\.it|localhost:4200/');
});
