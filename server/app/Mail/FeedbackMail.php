<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Email sent to the product owner whenever an in-app feedback form is
 * submitted (#311). Plain-text body — no HTML rendering needed for a
 * one-recipient ops channel; the text view is also the lowest common
 * denominator across mail clients including the owner's mobile.
 *
 * The Mailable carries everything the owner needs to triage without
 * pinging the user back: subject, description, app version
 * (build-time tag from the SPA), user-agent, and the user's email +
 * academy id for context. The optional image attachment is wired
 * through Mailables\Attachment::fromPath so it rides the SMTP message
 * inline (Resend handles attachments natively).
 */
class FeedbackMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  string  $subjectLine  user-supplied subject (validated 3..100 chars upstream)
     * @param  string  $description  user-supplied description (validated 10..2000 chars upstream)
     * @param  string  $userEmail  authenticated user's email — saves a DB lookup at triage time
     * @param  int|null  $academyId  null when the user has no academy yet (early in onboarding)
     * @param  string  $appVersion  SPA build tag at the time of submission (e.g. "v1.9.0", "dev")
     * @param  string  $userAgent  browser User-Agent header verbatim
     * @param  string|null  $imagePath  absolute path to the temporary uploaded file, or null
     * @param  string|null  $imageOriginalName  client-provided filename for the attachment, or null
     */
    public function __construct(
        public readonly string $subjectLine,
        public readonly string $description,
        public readonly string $userEmail,
        public readonly ?int $academyId,
        public readonly string $appVersion,
        public readonly string $userAgent,
        public readonly ?string $imagePath = null,
        public readonly ?string $imageOriginalName = null,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            // Subject prefixed so the owner can filter feedback emails
            // out of the regular inbox noise. App version inline in the
            // subject so a glance at the inbox tells the owner "v1.9.0
            // user reported X".
            subject: "[Budojo feedback {$this->appVersion}] {$this->subjectLine}",
            // Reply-To set to the user's email so the owner can hit
            // reply directly without copying the address out of the
            // body. From: stays at MAIL_FROM_ADDRESS so the SMTP
            // sender domain matches DKIM / SPF.
            replyTo: [new Address($this->userEmail)],
        );
    }

    public function content(): Content
    {
        // text: (NOT view:) so the blade renders as text/plain — newlines
        // and the dashed separators survive intact, and characters like
        // "&" / "<" are not HTML-escaped into entities. The blade
        // template carries no HTML markup; using `view:` would bury it
        // in a text/html part and most clients would collapse the
        // whitespace on render.
        return new Content(
            text: 'emails.feedback',
            with: [
                'subjectLine' => $this->subjectLine,
                'description' => $this->description,
                'userEmail' => $this->userEmail,
                'academyId' => $this->academyId,
                'appVersion' => $this->appVersion,
                'userAgent' => $this->userAgent,
                'hasImage' => $this->imagePath !== null,
            ],
        );
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        if ($this->imagePath === null) {
            return [];
        }

        return [
            Attachment::fromPath($this->imagePath)
                ->as($this->imageOriginalName ?? 'feedback-image'),
        ];
    }
}
