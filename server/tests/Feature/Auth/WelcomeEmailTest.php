<?php

declare(strict_types=1);

use App\Mail\WelcomeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;

beforeEach(function (): void {
    Mail::fake();
});

it('queues a WelcomeMail to the new user when registration succeeds', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
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
        'terms_accepted' => true,
    ])->assertUnprocessable();

    Mail::assertNotQueued(WelcomeMail::class);
});

it('keeps registration succeeding when the welcome-mail queue insert throws (#401 atomicity)', function (): void {
    // Simulate a queue-side failure (jobs-table insert error, transient
    // DB connection blip, Mailable serialization bug post-deploy). The
    // welcome mail is non-load-bearing onboarding — its failure must
    // NOT roll back the User row that's already been written, NOR
    // surface a 500 to the registration request. The try/catch in
    // RegisterUserAction routes the failure to report() so it shows
    // up in the error channel without breaking signup. Copilot caught
    // the previous unwrapped Mail::queue() shape on PR #401.

    // Suppress the verification email so its own Mail::to() pipeline
    // doesn't compete with the welcome-mail mock below — without
    // this fake, the first Mail::to() call comes from the
    // MustVerifyEmail notification (synchronous, fires from
    // event(Registered)) and trips the mock before
    // RegisterUserAction's explicit dispatch is even reached.
    Notification::fake();

    Mail::shouldReceive('to')
        ->once()
        ->andThrow(new \RuntimeException('jobs-table insert failed'));

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated()
        ->assertJsonPath('data.email', 'mario@example.com');

    // The User row exists despite the queue failure — registration is
    // committed regardless of the welcome-mail outcome.
    expect(User::where('email', 'mario@example.com')->exists())->toBeTrue();
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
