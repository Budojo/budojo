<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Account-deletion confirmation email (M5 PR-C, partial close of #223,
 * email-link cancel landed in #545).
 * Queued via the database queue; ride-along with the welcome-mail and
 * password-reset path through the same Forge daemon.
 *
 * **What this email is**: confirmation that the user's deletion
 * request was accepted, the scheduled execution date (now + 30 days),
 * and a one-click cancel CTA that hits the public token-bound SPA
 * page (`/account/deletion-cancel/{token}`). The page POSTs the
 * token to `/api/v1/me/deletion-request/cancel/{token}`, which
 * deletes the `pending_deletions` row and shows a calm confirmation
 * — no login required.
 *
 * **GDPR posture**: the body is deliberately calm and procedural, no
 * "are you sure?" panic. The user knows what they did; we confirm
 * the timeline and leave the door open for 30 days.
 */
class AccountDeletionRequestedMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly CarbonInterface $scheduledFor,
        public readonly string $cancelToken,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address($this->user->email, $this->user->full_name)],
            subject: 'Your Budojo account is scheduled for deletion',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.account-deletion-requested',
            with: [
                // Account-deletion is a legal/audit context — full
                // legal name is the right shape for the body, not the
                // first-name greeting we use elsewhere.
                'name' => $this->user->full_name,
                'scheduledFor' => $this->scheduledFor->format('F j, Y'),
                // Public SPA page that POSTs the token to the cancel
                // endpoint on mount — see #545 for the route shape.
                'cancelUrl' => $this->resolvedClientUrl() . '/account/deletion-cancel/' . $this->cancelToken,
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
