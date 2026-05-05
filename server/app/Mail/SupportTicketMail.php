<?php

declare(strict_types=1);

namespace App\Mail;

use App\Enums\SupportTicketCategory;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Email sent to the support inbox whenever the dedicated support form
 * (#423) is submitted. Distinct from `FeedbackMail` (#311) — the latter
 * is a fire-and-forget product-feedback dump; THIS Mailable opens a
 * conversation, so:
 *
 * 1. **Reply-To set to the user's email** — the support inbox can hit
 *    Reply directly and the message lands in the user's mailbox, no
 *    further round-tripping required.
 * 2. **HTML branded shell** — the support thread is a customer-facing
 *    surface, so we render through the Laravel mail markdown layout
 *    (`mail::message`) for a consistent header / footer.
 * 3. **Queueable** — `ShouldQueue` is mandatory: the SMTP round-trip
 *    must NOT happen inside the request, so a Resend brown-out can't
 *    turn into a 500 on the support form. The action wraps the
 *    `Mail::queue(...)` call in a try/catch with `report()` for the
 *    pathological case where the queue insert itself fails (DB blip,
 *    serialization regression).
 */
class SupportTicketMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  string  $subjectLine  user-supplied subject (3..100 chars, validated upstream)
     * @param  SupportTicketCategory  $category  one of Account / Billing / Bug / Other
     * @param  string  $body  user-supplied free-text body (10..5000 chars, validated upstream)
     * @param  string  $userEmail  authenticated user's email — also the Reply-To target
     * @param  string  $userName  authenticated user's display name — surfaces in the body for triage
     */
    public function __construct(
        public readonly string $subjectLine,
        public readonly SupportTicketCategory $category,
        public readonly string $body,
        public readonly string $userEmail,
        public readonly string $userName,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            // Subject prefixed with [Budojo support · <category>] so
            // the inbox owner can filter / route at a glance. The
            // category surfaces inline (not just in the body) because
            // a glance at the inbox is the primary triage moment.
            subject: "[Budojo support · {$this->category->value}] {$this->subjectLine}",

            // Reply-To = the user's email + name. From: stays at
            // MAIL_FROM_ADDRESS so the SMTP sender domain matches
            // DKIM / SPF and Resend can deliver the message; the user
            // never receives a reply at the From: address (they don't
            // own that mailbox), Reply-To is what mail clients use
            // when the human in the inbox hits "Reply".
            replyTo: [new Address($this->userEmail, $this->userName)],
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.support-ticket',
            with: [
                'subjectLine' => $this->subjectLine,
                'category' => $this->category->value,
                'body' => $this->body,
                'userName' => $this->userName,
                'userEmail' => $this->userEmail,
            ],
        );
    }
}
