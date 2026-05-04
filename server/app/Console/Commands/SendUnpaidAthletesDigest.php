<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\AthleteStatus;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\NotificationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Monthly digest emailed to every academy on the 16th, listing every
 * active athlete who hasn't yet been marked paid for the current
 * month. Scheduled at 09:00 Europe/Rome on day 16 from
 * `routes/console.php`. M5 PR-E.
 *
 * The 16th is when the dashboard's `unpaid-this-month-widget` starts
 * surfacing — pre-15 a "not paid yet" state is normal because most
 * customers settle in the first half of the month. Pushing the
 * widget signal out via email on day 16 + matches when the
 * instructor actually wants the chase-list.
 *
 * **De-dup** via the `notification_log` table introduced in PR-D —
 * unique key (academy_id, notification_type, sent_for_date) is the
 * race-safety guarantee. Same claim-then-queue ordering as PR-D:
 * NotificationLog::create() runs FIRST inside DB::transaction,
 * Mail::queue() runs only if the create succeeded. UniqueConstraintViolationException
 * routes to skip; a queue-side throw rolls back the claim and the
 * next run picks up the still-unsent academy.
 *
 * **Resilience**: per-academy failures are logged and DO NOT stop
 * the loop.
 *
 * **Idempotency** — `--force` bypasses the de-dup check for an
 * exceptional re-send.
 */
class SendUnpaidAthletesDigest extends Command
{
    public const NOTIFICATION_TYPE = 'unpaid_athletes_digest';

    protected $signature = 'budojo:send-unpaid-athletes-digest'
        . ' {--force : Re-send the digest even if notification_log already records it}'
        . ' {--year= : Override the year (default: current year)}'
        . ' {--month= : Override the month (default: current month)}';

    protected $description = 'Monthly digest: athletes still unpaid for the current month per academy (M5 PR-E)';

    public function handle(): int
    {
        $today = Carbon::today();

        // Validate --year / --month BEFORE casting to int (#404 follow-up
        // round 2). PHP's (int) cast eats non-digit suffixes silently —
        // `(int) '4foo' === 4`, `(int) '2026abc' === 2026` — so a
        // post-cast bounds check would let those through. ctype_digit
        // on the raw option enforces "all digits or nothing".
        $rawMonth = $this->option('month');
        $rawYear = $this->option('year');

        // preg_match instead of ctype_digit because Artisan::call from
        // tests can hand integers (`['--year' => 2026]`) where the
        // CLI hands strings ('--year=2026'). preg_match coerces to
        // string and tolerates both. The pattern explicitly anchors
        // ^...$ so trailing non-digits get rejected (Copilot's
        // partially-numeric concern).
        if ($rawMonth !== null && preg_match('/^\d+$/', (string) $rawMonth) !== 1) {
            $this->error("Invalid --month value: must be a positive integer 1..12, got '{$rawMonth}'.");

            return self::INVALID;
        }
        if ($rawYear !== null && preg_match('/^\d+$/', (string) $rawYear) !== 1) {
            $this->error("Invalid --year value: must be a positive integer year >= 2000, got '{$rawYear}'.");

            return self::INVALID;
        }

        $year = (int) ($rawYear ?? $today->year);
        $month = (int) ($rawMonth ?? $today->month);

        if ($month < 1 || $month > 12) {
            $this->error("Invalid --month value: must be 1..12, got {$month}.");

            return self::INVALID;
        }
        // Bound is 2000..9999, message names that lower bound explicitly
        // so an operator who fat-fingers `--year=26` understands the
        // constraint instead of being told it's "not a 4-digit year".
        if ($year < 2000 || $year > 9999) {
            $this->error("Invalid --year value: must be a year >= 2000 (4-digit), got {$year}.");

            return self::INVALID;
        }

        // The de-dup key for this digest is the TARGET MONTH, not the
        // run date. An April-backfill on May 20 must NOT collide with
        // (and prevent) the real May digest scheduled for the same
        // day; conversely, two April-backfills on different dates
        // must dedup against each other. The sent_for_date row is
        // therefore the first-of-month for $year/$month.
        $sentForDate = Carbon::create($year, $month, 1);
        if ($sentForDate === null) {
            // Belt-and-suspenders — the validation above guarantees
            // valid year/month, but PHPStan reads Carbon::create as
            // returning Carbon|null and the runtime guard narrows it.
            $this->error('Internal: could not construct sent-for date.');

            return self::FAILURE;
        }

        $sent = 0;
        $skipped = 0;
        $failed = 0;
        $force = (bool) $this->option('force');

        Academy::query()
            ->with('owner')
            // Skip academies whose owner hasn't set a monthly fee yet
            // (#404 follow-up). The "unpaid this month" concept only
            // makes sense once a fee is configured — a fee-less
            // academy treats payments as off-platform / cash, and a
            // monthly chase email there is noise. Mirror of the
            // dashboard's `unpaid-this-month-widget` which hides
            // entirely when monthly_fee_cents is null.
            ->whereNotNull('monthly_fee_cents')
            ->chunkById(50, function ($chunk) use ($year, $month, $sentForDate, $force, &$sent, &$skipped, &$failed): void {
                foreach ($chunk as $academy) {
                    try {
                        $athletes = $this->unpaidActiveAthletesFor($academy, $year, $month);

                        if ($athletes->isEmpty()) {
                            // No spam: an academy with zero unpaid
                            // athletes gets nothing in their inbox.
                            continue;
                        }

                        if ($force) {
                            NotificationLog::query()
                                ->where('academy_id', $academy->id)
                                ->where('notification_type', self::NOTIFICATION_TYPE)
                                ->whereDate('sent_for_date', $sentForDate)
                                ->delete();
                        }

                        // Race-safe send: claim-first, queue-second,
                        // wrap in DB::transaction so a queue-side
                        // failure rolls back the claim. Mirror of
                        // PR-D's pattern after the Copilot review.
                        $queued = DB::transaction(function () use ($academy, $athletes, $year, $month, $sentForDate): bool {
                            try {
                                NotificationLog::query()->create([
                                    'academy_id' => $academy->id,
                                    'notification_type' => self::NOTIFICATION_TYPE,
                                    'sent_for_date' => $sentForDate,
                                ]);
                            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                                return false;
                            }

                            Mail::to($academy->owner)->queue(
                                new UnpaidAthletesDigestMail($academy, $athletes, $year, $month),
                            );

                            return true;
                        });

                        if (! $queued) {
                            ++$skipped;
                            $this->line(\sprintf('skipped academy #%d (already sent today)', $academy->id));

                            continue;
                        }

                        ++$sent;
                        $this->line(\sprintf(
                            'queued unpaid digest for academy #%d (%d athlete%s)',
                            $academy->id,
                            $athletes->count(),
                            $athletes->count() === 1 ? '' : 's',
                        ));
                    } catch (\Throwable $e) {
                        ++$failed;
                        report($e);
                        $this->error(\sprintf('FAILED academy #%d: %s', $academy->id, $e->getMessage()));
                    }
                }
            });

        $this->info(\sprintf(
            'Done. Sent: %d. Skipped (already sent today): %d. Failed: %d.',
            $sent,
            $skipped,
            $failed,
        ));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Active athletes in the given academy who have no AthletePayment
     * row for ($year, $month). Suspended / Inactive athletes are
     * excluded — they aren't expected to pay so they shouldn't
     * surface in the chase-list.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, Athlete>
     */
    private function unpaidActiveAthletesFor(Academy $academy, int $year, int $month): \Illuminate\Database\Eloquent\Collection
    {
        return Athlete::query()
            ->where('academy_id', $academy->id)
            ->where('status', AthleteStatus::Active)
            ->whereDoesntHave('payments', function ($q) use ($year, $month): void {
                $q->where('year', $year)->where('month', $month);
            })
            ->orderBy('last_name', 'asc')
            ->orderBy('first_name', 'asc')
            ->get();
    }
}
