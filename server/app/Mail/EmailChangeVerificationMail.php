<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

/**
 * Email queued at the end of `RequestEmailChangeAction::execute()` (#476).
 * Goes to the NEW (candidate) email address — the click confirms that
 * the target address is reachable by the legitimate owner. The link
 * lands on the SPA's public `/auth/verify-email-change/{token}` route,
 * which calls `POST /email-change/{token}/verify`; the server applies
 * the change to `users.email` and the SPA bounces to `/auth/login` so
 * the user can sign in with the new address (no auto-login by design —
 * the conservative anti-leak choice from the issue's open questions).
 *
 * **Queueing**: `ShouldQueue` is mandatory. The action wraps the
 * `Mail::queue(...)` call in a try/catch + `report()` so a Resend
 * brown-out doesn't 500 the request. Mirrors the AthleteInvitationMail
 * shape.
 *
 * **Token handling**: the Mailable carries the RAW token (the only
 * place it ever exists at rest is the email body) and stitches it into
 * the URL. The DB column `pending_email_changes.token` stores the
 * SHA-256 hash; `RequestEmailChangeAction` computes both at request
 * time and only the hash survives.
 */
class EmailChangeVerificationMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly string $rawToken,
        public readonly string $userName,
        public readonly Carbon $expiresAt,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Conferma il tuo nuovo indirizzo email su Budojo');
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.email-change-verification',
            with: [
                'userName' => $this->userName,
                'verifyUrl' => $this->resolvedVerifyUrl(),
                'expiresAt' => $this->expiresAt,
            ],
        );
    }

    private function resolvedVerifyUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        return rtrim($resolved, '/') . '/auth/verify-email-change/' . $this->rawToken;
    }
}
