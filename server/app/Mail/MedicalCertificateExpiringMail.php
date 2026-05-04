<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Academy;
use App\Models\Document;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Daily digest emailed to an academy owner listing every medical
 * certificate in their roster whose `expires_at` falls on one of the
 * three trigger thresholds (today, today+7, today+30). M5 PR-D.
 *
 * Per-academy aggregation, NOT per-cert: an academy with five
 * athletes whose certs expire on the same trigger day gets ONE email
 * with five rows, not five separate emails. Inbox-friendly and
 * matches the M3 "expiring documents" dashboard widget shape.
 *
 * **Queueing** is mandatory — the artisan command iterates every
 * academy synchronously, so any inline SMTP would multiply the run
 * time by the number of academies. The Forge daemon (PR-B)
 * processes queued emails out-of-band.
 *
 * **Localisation**: English-only in PR-D. Same `User->preferredLanguage`
 * follow-up applies as in the rest of M5.
 */
class MedicalCertificateExpiringMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  Collection<int, Document>  $documents  the expiring medical-cert
     *                                                rows for this academy on
     *                                                this run, with
     *                                                `athlete` already eager-
     *                                                loaded.
     */
    public function __construct(
        public readonly Academy $academy,
        public readonly Collection $documents,
    ) {
    }

    public function envelope(): Envelope
    {
        $owner = $this->owner();

        return new Envelope(
            to: [new Address($owner->email, $owner->name)],
            subject: \sprintf(
                'Medical certificates expiring soon — %s',
                $this->academy->name,
            ),
        );
    }

    public function content(): Content
    {
        // Pre-compute per-row labels in PHP land so the blade template
        // renders simple `{{ $row['status'] }}` instead of inlining
        // `@php` + Carbon::today() per iteration. Carbon::today() is
        // captured once for the whole digest; status strings stay
        // human-readable + locale-friendly when we add IT in a follow-
        // up. Copilot caught the readability issue on PR-D.
        $today = \Illuminate\Support\Carbon::today();
        $rows = $this->documents->map(static function (\App\Models\Document $doc) use ($today): array {
            $athlete = $doc->athlete;
            $expiresAt = $doc->expires_at;
            $name = $athlete !== null
                ? trim($athlete->first_name . ' ' . $athlete->last_name)
                : '—';

            $status = match (true) {
                $expiresAt === null => '—',
                $expiresAt->isToday() => '**Expires today**',
                $expiresAt->isPast() => '**Already expired**',
                default => 'In ' . (int) $today->diffInDays($expiresAt) . ' days',
            };

            return [
                'name' => $name,
                'expires_on' => $expiresAt?->format('Y-m-d') ?? '—',
                'status' => $status,
            ];
        });

        return new Content(
            markdown: 'mail.medical-certificate-expiring',
            with: [
                'ownerName' => $this->owner()->name,
                'academyName' => $this->academy->name,
                'rows' => $rows,
                'clientUrl' => $this->resolvedClientUrl(),
            ],
        );
    }

    /**
     * Resolve the academy owner with an explicit null guard. The
     * `academies.user_id` FK is non-nullable in the schema, so a real
     * Academy always has a real User behind it — but PHPStan reads
     * `Academy::owner()` as `BelongsTo<User>` whose accessor returns
     * `User|null`. Throwing here surfaces the impossible case as an
     * actionable runtime error instead of fatal-ing on `null->email`.
     */
    private function owner(): \App\Models\User
    {
        $owner = $this->academy->owner;
        if ($owner === null) {
            throw new \LogicException(\sprintf(
                'Academy #%d has no owner — schema invariant violated.',
                $this->academy->id,
            ));
        }

        return $owner;
    }

    private function resolvedClientUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        return rtrim($resolved, '/');
    }
}
