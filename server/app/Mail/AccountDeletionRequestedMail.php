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
 * Account-deletion confirmation email (M5 PR-C, partial close of #223).
 * Queued via the database queue; ride-along with the welcome-mail and
 * password-reset path through the same Forge daemon.
 *
 * **What this email is**: confirmation that the user's deletion
 * request was accepted, the scheduled execution date (now + 30 days),
 * and clear instructions for cancelling within the grace window.
 *
 * **What this email is NOT (yet)**: a one-click cancel deep link.
 * The PRD calls for a token-based public cancel endpoint that
 * consumes `pending_deletions.confirmation_token` on click — that
 * lives behind a public SPA page (`/auth/account-deletion-cancelled`)
 * which is in scope of #223 itself, not this PR. Until #223 ships
 * that page, the email links the user to the SPA root; once logged
 * in, they cancel from `/dashboard/profile` (the existing
 * auth-gated `DELETE /me/deletion-request` endpoint). When the SPA
 * page lands, swap the CTA URL to the deep link with the token —
 * the token is already on the `pending_deletions` row, no schema
 * change needed.
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
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address($this->user->email, $this->user->name)],
            subject: 'Your Budojo account is scheduled for deletion',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.account-deletion-requested',
            with: [
                'name' => $this->user->name,
                'scheduledFor' => $this->scheduledFor->format('F j, Y'),
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
