<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Welcome email queued at the end of `RegisterUserAction::execute()`
 * (M5 PR-B). Deliberately separate from the email-verification
 * notification (which Laravel's MustVerifyEmail trait dispatches on
 * the Registered event) — the verification mail is transactional,
 * the welcome mail is product-onboarding-shaped: it mentions the
 * setup wizard, links the user back to the SPA root (the
 * `noAcademyGuard` lands them on `/setup` automatically until they
 * create an academy), and points at the privacy policy + sub-
 * processors page so a user who skimmed the registration form has a
 * second chance to read them.
 *
 * **Queueing**: `ShouldQueue` is mandatory. Without it the SMTP
 * round-trip happens inside the registration request and a Resend
 * brown-out turns into a 500 on registration — exactly the failure
 * mode M5 is supposed to prevent. The Forge daemon configured in
 * docs/infra/production-deployment.md runs `queue:work --tries=3
 * --backoff=10` so a transient delivery failure retries 3x before
 * giving up.
 *
 * **Localisation**: the body is English-only in PR-B. A future
 * follow-up (deferred per PRD) reads `User->preferredLanguage` (when
 * we add that column) and picks the matching blade template variant.
 * Italian users get an English welcome until then; not a regression
 * because nothing else exists today.
 */
class WelcomeMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address($this->user->email, $this->user->name)],
            subject: 'Welcome to Budojo',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.welcome',
            with: [
                'name' => $this->user->name,
                // Single CTA URL — the SPA's noAcademyGuard auto-redirects
                // a freshly-registered user to /setup, so a root-level
                // link is correct regardless of onboarding state. We
                // strip a trailing slash from the configured client URL
                // for the same reason as the verification redirect.
                'clientUrl' => $this->resolvedClientUrl(),
            ],
        );
    }

    private function resolvedClientUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        return rtrim($resolved, '/');
    }
}
