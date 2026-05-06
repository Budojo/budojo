<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Audit-trail email queued at the end of `RequestEmailChangeAction` (#476).
 * Goes to the OLD email — i.e. the address `users.email` currently is
 * — to put the legitimate account holder on notice that a change has
 * been requested. Text-only by design (V1): no clickable undo link,
 * just a "if this wasn't you, contact support immediately at the
 * support email" instruction. The V2 deferral (a tokenised undo link
 * inside this mail) is tracked separately; the V1 mitigation is
 * sufficient because:
 *
 * - The change is NOT applied until the new-email confirmation is
 *   clicked (pending-then-verify, not apply-then-verify).
 * - The legitimate user is alerted on this channel and can revoke via
 *   support before the verification link is clicked.
 *
 * The mail does NOT carry the new email verbatim — it mentions the
 * domain/local-part partially to confirm "yes, an attempt was made"
 * without revealing the attacker's full address to a shoulder-surfer
 * of the legitimate user's inbox.
 */
class EmailChangeNotificationMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly string $userName,
        public readonly string $newEmailPartial,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Cambio email richiesto sul tuo account Budojo');
    }

    public function content(): Content
    {
        // Reuse the same canonical support address constant as the
        // support-ticket flow so the "contact support" instruction in
        // the body always lands at the live inbox without forcing
        // callers to thread a value through.
        return new Content(
            markdown: 'mail.email-change-notification',
            with: [
                'userName' => $this->userName,
                'newEmailPartial' => $this->newEmailPartial,
                'supportEmail' => \App\Actions\Support\SubmitSupportTicketAction::SUPPORT_EMAIL,
            ],
        );
    }
}
