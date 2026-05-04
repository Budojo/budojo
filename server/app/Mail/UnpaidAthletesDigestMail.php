<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

/**
 * Monthly digest emailed to an academy owner on the 16th, listing
 * every active athlete who hasn't yet been marked paid for the
 * current month. M5 PR-E.
 *
 * The 16th is the moment the dashboard's `unpaid-this-month-widget`
 * starts surfacing — pre-15th, "not paid yet" is normal because most
 * customers pay around the 1st-15th window. Pushing the widget
 * signal out via email on day 16 + matches when the instructor
 * actually wants the chase-list.
 *
 * **Scope**: only athletes whose `status === 'active'`. Suspended
 * and inactive athletes don't owe a fee for the month so they
 * shouldn't surface in the chase-list.
 *
 * **Queueing**: same ShouldQueue + atomicity discipline as the
 * cert-expiry digest in PR-D.
 *
 * **Localisation**: English-only. Same `User->preferredLanguage`
 * follow-up applies as the rest of M5.
 */
class UnpaidAthletesDigestMail extends Mailable implements ShouldQueue
{
    use Queueable;
    use SerializesModels;

    /**
     * @param  Collection<int, Athlete>  $athletes  active athletes with no payment
     *                                              for ($year, $month).
     */
    public function __construct(
        public readonly Academy $academy,
        public readonly Collection $athletes,
        public readonly int $year,
        public readonly int $month,
    ) {
    }

    public function envelope(): Envelope
    {
        $owner = $this->owner();

        return new Envelope(
            to: [new Address($owner->email, $owner->name)],
            subject: \sprintf(
                'Athletes still unpaid for %s — %s',
                $this->monthLabel(),
                $this->academy->name,
            ),
        );
    }

    public function content(): Content
    {
        $owner = $this->owner();

        // Pre-compute per-row strings in PHP land so the blade template
        // is dumb-render only — same pattern as the cert-expiry mail
        // in PR-D after the Copilot review.
        $rows = $this->athletes->map(static fn (Athlete $athlete): array => [
                'name' => trim($athlete->first_name . ' ' . $athlete->last_name),
                // Athlete.belt + .joined_at are both non-nullable in
                // the schema (the form requires both at create time);
                // the cast always returns a Belt enum / Carbon date.
                'belt' => $athlete->belt->value,
                'joined' => $athlete->joined_at->format('Y-m-d'),
            ]);

        return new Content(
            markdown: 'mail.unpaid-athletes-digest',
            with: [
                'ownerName' => $owner->name,
                'academyName' => $this->academy->name,
                'monthLabel' => $this->monthLabel(),
                'rows' => $rows,
                'count' => $this->athletes->count(),
                'clientUrl' => $this->resolvedClientUrl(),
            ],
        );
    }

    /**
     * Format the digest month as `F Y` ("May 2026") for use in both
     * the subject line and the body. Carbon::create()'s PHPDoc
     * return type is `Carbon|null`; the year + month are always
     * provided as positive ints from the artisan command, so the
     * null branch is unreachable but PHPStan needs the guard.
     */
    private function monthLabel(): string
    {
        $date = Carbon::create($this->year, $this->month);
        if ($date === null) {
            throw new \LogicException(\sprintf(
                'Invalid year/month combination: %d/%d',
                $this->year,
                $this->month,
            ));
        }

        return $date->format('F Y');
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
