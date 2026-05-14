<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Transactional welcome email queued at the tail of
 * `AcceptAthleteInvitationAction` (#729 B5). Distinct from the
 * `WelcomeMail` (sent to new gym-OWNER signups) — this one targets the
 * just-invited athlete the moment they complete the invitation accept
 * + sign-in flow.
 *
 * Always sent — no opt-out gate. Transactional emails in Budojo bypass
 * the `notification_preferences` matrix (see `NotificationCategory`
 * docblock § "Not listed here"). The user can still uninstall the SPA
 * / unsubscribe in their email client; the application-level
 * preferences panel correctly does NOT surface a toggle for it.
 */
class AthleteWelcomeToAcademyMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Academy $academy,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address($this->user->email, $this->user->full_name)],
            subject: \sprintf('Welcome to %s on Budojo', $this->academy->name),
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.athlete-welcome-to-academy',
            with: [
                'name' => $this->user->first_name,
                'academyName' => $this->academy->name,
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
