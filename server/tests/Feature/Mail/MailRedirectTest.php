<?php

declare(strict_types=1);

use App\Mail\WelcomeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

it('redirects every Mailable recipient to MAIL_TEST_REDIRECT in non-production (integration via array driver)', function (): void {
    // `Mail::alwaysTo()` rewrites recipients at send-time on the
    // underlying mailer. `Mail::fake()` short-circuits the mailer
    // entirely, so the alwaysTo hook never fires under fake — we
    // need a real (but trapped) mailer to observe the rewrite.
    // Laravel's `array` mailer captures every send into the
    // testing collector without going to the network — perfect
    // here. The boot() hook has already wired alwaysTo at app
    // boot, so we just need to swap to `array` and send.
    config([
        'mail.default' => 'array',
        'mail.mailers.array' => ['transport' => 'array'],
    ]);

    /** @var User $user */
    $user = User::factory()->create(['email' => 'real-user@example.com', 'name' => 'Mario Rossi']);

    Mail::to($user->email)->send(new WelcomeMail($user));

    // Laravel's `array` transport keeps the messages in
    // `ArrayTransport::messages()` (Collection of SentMessage).
    /** @var \Illuminate\Mail\Transport\ArrayTransport $transport */
    $transport = app('mailer')->getSymfonyTransport();
    $messages = $transport->messages();
    expect($messages)->toHaveCount(1);

    $envelope = $messages->first()->getEnvelope();
    $recipients = array_map(fn ($r) => $r->getAddress(), $envelope->getRecipients());

    expect($recipients)->toContain('matteo.bonanno@budojo.it');
    expect($recipients)->not->toContain('real-user@example.com');
});

it('exposes the redirect target via the mail.test_redirect config key in non-production', function (): void {
    // PEST runs in `testing` env, which is non-production. We assert
    // the two preconditions for the boot() hook to fire: the env
    // gate evaluates correctly, AND the config key resolves to the
    // expected default (the support inbox). The end-to-end behaviour
    // — that the boot hook actually rewrites recipients — is covered
    // by the integration test above via the `array` mailer transport.
    expect(app()->environment('production'))->toBeFalse();
    expect(config('mail.test_redirect'))->toBe('matteo.bonanno@budojo.it');
});
