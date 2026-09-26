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
 * Email queued at the end of `SendAthleteInvitationAction::execute()`
 * (#445, M7 PR-B). The link in the body is the auth: clicking it lands
 * the athlete on the public `/athlete-invite/{token}` route in the SPA,
 * where they choose a password + accept ToS / privacy and get
 * auto-logged-in (PR-C lands the consume side).
 *
 * **Queueing**: `ShouldQueue` is mandatory. The action wraps the
 * `Mail::queue(...)` call in a try/catch + `report()` so a Resend
 * brown-out doesn't 500 the invite request. The forge daemon's
 * `queue:work --tries=3 --backoff=10` retries on transient failures.
 *
 * **Token handling**: The Mailable carries the RAW token (the only
 * place it ever exists) and stitches it into the URL. The DB column
 * stores the SHA-256 hash; the action computes both at invite time
 * and only the hash survives the request.
 */
class AthleteInvitationMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly string $rawToken,
        public readonly string $athleteName,
        public readonly string $academyName,
        public readonly string $ownerName,
        public readonly Carbon $expiresAt,
    ) {
    }

    public function envelope(): Envelope
    {
        // Subject prefixes with the academy name so a busy inbox
        // surfaces the inviting academy at a glance, mirroring the
        // support-mail subject pattern.
        $subject = $this->academyName !== ''
            ? "You've been invited to {$this->academyName} on Budojo"
            : "You've been invited to Budojo";

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.athlete-invitation',
            with: [
                'athleteName' => $this->athleteName,
                'academyName' => $this->academyName,
                'ownerName' => $this->ownerName,
                'inviteUrl' => $this->resolvedInviteUrl(),
                'expiresAt' => $this->expiresAt,
                'expiryDays' => max(1, $this->expiresAt->diffInDays(now()->startOfDay())),
            ],
        );
    }

    private function resolvedInviteUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        return rtrim($resolved, '/') . '/athlete-invite/' . $this->rawToken;
    }
}
