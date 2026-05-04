<?php

declare(strict_types=1);

use App\Console\Commands\SendUnpaidAthletesDigest;
use App\Enums\AthleteStatus;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\NotificationLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

beforeEach(function (): void {
    Mail::fake();
    Carbon::setTestNow('2026-05-16 09:00:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function makeAcademyForUnpaid(string $email = 'owner@example.com'): Academy
{
    $user = User::factory()->create(['email' => $email]);

    // monthly_fee_cents must be set — the digest skips academies
    // with a null fee since the "unpaid this month" concept is
    // undefined there (#404 follow-up).
    return Academy::factory()->for($user, 'owner')->create(['monthly_fee_cents' => 5000]);
}

function makeAthleteForUnpaid(Academy $academy, AthleteStatus $status = AthleteStatus::Active, ?array $paymentsFor = null): Athlete
{
    $athlete = Athlete::factory()->create([
        'academy_id' => $academy->id,
        'status' => $status,
    ]);
    if ($paymentsFor !== null) {
        AthletePayment::factory()->create([
            'athlete_id' => $athlete->id,
            'year' => $paymentsFor['year'],
            'month' => $paymentsFor['month'],
        ]);
    }

    return $athlete;
}

it('queues a digest with only the active unpaid athletes for this month (golden path)', function (): void {
    $academy = makeAcademyForUnpaid();

    // 4 unpaid active athletes (in digest)
    makeAthleteForUnpaid($academy);
    makeAthleteForUnpaid($academy);
    makeAthleteForUnpaid($academy);
    makeAthleteForUnpaid($academy);

    // 1 active but PAID for May 2026 (not in digest)
    makeAthleteForUnpaid($academy, AthleteStatus::Active, ['year' => 2026, 'month' => 5]);

    // 1 suspended unpaid (not in digest — they don't owe a fee)
    makeAthleteForUnpaid($academy, AthleteStatus::Suspended);
    // 1 inactive unpaid (not in digest)
    makeAthleteForUnpaid($academy, AthleteStatus::Inactive);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertQueued(UnpaidAthletesDigestMail::class, fn (UnpaidAthletesDigestMail $mail): bool => $mail->academy->id === $academy->id
            && $mail->athletes->count() === 4
            && $mail->year === 2026
            && $mail->month === 5
            && $mail->hasTo('owner@example.com'));
});

it('does not queue a mail when an academy has zero unpaid active athletes (no spam)', function (): void {
    $academy = makeAcademyForUnpaid();

    // 2 athletes, BOTH paid for May 2026.
    makeAthleteForUnpaid($academy, AthleteStatus::Active, ['year' => 2026, 'month' => 5]);
    makeAthleteForUnpaid($academy, AthleteStatus::Active, ['year' => 2026, 'month' => 5]);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertNothingQueued();
});

it('does not queue a mail when the only unpaid athletes are suspended / inactive', function (): void {
    $academy = makeAcademyForUnpaid();

    // 2 unpaid but NOT active — they don't owe a fee.
    makeAthleteForUnpaid($academy, AthleteStatus::Suspended);
    makeAthleteForUnpaid($academy, AthleteStatus::Inactive);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertNothingQueued();
});

it('skips an academy whose digest was already sent today (de-dup via notification_log)', function (): void {
    $academy = makeAcademyForUnpaid();
    makeAthleteForUnpaid($academy);

    // Seed the log row at the TARGET month start (#404 follow-up:
    // sent_for_date is anchored to the digest month, not the run date).
    NotificationLog::query()->create([
        'academy_id' => $academy->id,
        'notification_type' => SendUnpaidAthletesDigest::NOTIFICATION_TYPE,
        'sent_for_date' => Carbon::create(2026, 5, 1),
    ]);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertNothingQueued();
});

it('--force re-sends even when notification_log already has a row for today', function (): void {
    $academy = makeAcademyForUnpaid();
    makeAthleteForUnpaid($academy);

    // Seed the log row at the TARGET month start (#404 follow-up:
    // sent_for_date is anchored to the digest month, not the run date).
    NotificationLog::query()->create([
        'academy_id' => $academy->id,
        'notification_type' => SendUnpaidAthletesDigest::NOTIFICATION_TYPE,
        'sent_for_date' => Carbon::create(2026, 5, 1),
    ]);

    \Artisan::call('budojo:send-unpaid-athletes-digest', ['--force' => true]);

    Mail::assertQueued(UnpaidAthletesDigestMail::class, 1);
});

it('records a notification_log row after the queue insert (so the next run skips)', function (): void {
    $academy = makeAcademyForUnpaid();
    makeAthleteForUnpaid($academy);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    expect(NotificationLog::query()
        ->where('academy_id', $academy->id)
        ->where('notification_type', SendUnpaidAthletesDigest::NOTIFICATION_TYPE)
        ->whereDate('sent_for_date', '2026-05-01')
        ->exists())->toBeTrue();

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertQueued(UnpaidAthletesDigestMail::class, 1);
});

it('iterates multiple academies independently — each gets its own digest', function (): void {
    $a = makeAcademyForUnpaid('a@example.com');
    $b = makeAcademyForUnpaid('b@example.com');
    $c = makeAcademyForUnpaid('c@example.com');

    makeAthleteForUnpaid($a);
    makeAthleteForUnpaid($b);
    // Academy c has zero unpaid athletes — must NOT receive a mail.
    makeAthleteForUnpaid($c, AthleteStatus::Active, ['year' => 2026, 'month' => 5]);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertQueued(UnpaidAthletesDigestMail::class, 2);
    Mail::assertQueued(UnpaidAthletesDigestMail::class, fn (UnpaidAthletesDigestMail $m): bool => $m->hasTo('a@example.com'));
    Mail::assertQueued(UnpaidAthletesDigestMail::class, fn (UnpaidAthletesDigestMail $m): bool => $m->hasTo('b@example.com'));
    Mail::assertNotQueued(UnpaidAthletesDigestMail::class, fn (UnpaidAthletesDigestMail $m): bool => $m->hasTo('c@example.com'));
});

it('--year and --month override the current month for backfill / oncall re-sends', function (): void {
    $academy = makeAcademyForUnpaid();

    // The athlete was paid in MAY (the frozen current month) but NOT
    // in APRIL. Without the override, the run picks May → athlete is
    // paid → no mail. With --year=2026 --month=4, the run picks
    // April → athlete is unpaid → mail with year/month=2026/4. This
    // proves the override actually changes the WHO of the digest,
    // not just the metadata on the Mailable. Copilot caught the
    // weak version of this assertion on PR #404.
    makeAthleteForUnpaid($academy, AthleteStatus::Active, ['year' => 2026, 'month' => 5]);

    \Artisan::call('budojo:send-unpaid-athletes-digest', ['--year' => 2026, '--month' => 4]);

    Mail::assertQueued(UnpaidAthletesDigestMail::class, fn (UnpaidAthletesDigestMail $m): bool => $m->year === 2026 && $m->month === 4 && $m->athletes->count() === 1);
});

it('rejects --month outside 1..12 with INVALID exit code', function (): void {
    $exitCode = \Artisan::call('budojo:send-unpaid-athletes-digest', ['--month' => 13]);

    expect($exitCode)->toBe(2); // Symfony Console INVALID = 2
    Mail::assertNothingQueued();
});

it('rejects --year outside 4-digit YYYY range with INVALID exit code', function (): void {
    $exitCode = \Artisan::call('budojo:send-unpaid-athletes-digest', ['--year' => 99]);

    expect($exitCode)->toBe(2);
    Mail::assertNothingQueued();
});

it('rejects --month with non-digit suffix (eats partially-numeric strings — #405 round 2)', function (): void {
    // (int) '4foo' === 4 in PHP, so a post-cast bounds check would
    // happily accept "--month=4foo". ctype_digit on the raw option
    // string is the actual gate. Copilot caught this on #405.
    $exitCode = \Artisan::call('budojo:send-unpaid-athletes-digest', ['--month' => '4foo']);

    expect($exitCode)->toBe(2);
    Mail::assertNothingQueued();
});

it('rejects --year with non-digit suffix (eats partially-numeric strings — #405 round 2)', function (): void {
    $exitCode = \Artisan::call('budojo:send-unpaid-athletes-digest', ['--year' => '2026abc']);

    expect($exitCode)->toBe(2);
    Mail::assertNothingQueued();
});

it('skips academies with no monthly_fee_cents (#404 follow-up — undefined "unpaid" semantics)', function (): void {
    $user = User::factory()->create(['email' => 'noFee@example.com']);
    $academy = Academy::factory()->for($user, 'owner')->create(['monthly_fee_cents' => null]);
    makeAthleteForUnpaid($academy);

    \Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertNothingQueued();
});

it('uses the TARGET month as sent_for_date (#404 follow-up — backfill collision-free)', function (): void {
    // Frozen "today" = 2026-05-16. An April backfill run on May 16
    // must record sent_for_date = 2026-04-01 (the target month
    // start), NOT 2026-05-16 (the run date) — otherwise the
    // same-day May digest would be blocked by the unique index.
    $academy = makeAcademyForUnpaid();
    makeAthleteForUnpaid($academy);

    \Artisan::call('budojo:send-unpaid-athletes-digest', ['--year' => 2026, '--month' => 4]);

    expect(NotificationLog::query()
        ->where('academy_id', $academy->id)
        ->where('notification_type', SendUnpaidAthletesDigest::NOTIFICATION_TYPE)
        ->whereDate('sent_for_date', '2026-04-01')
        ->exists())->toBeTrue();

    // Critically: the row for the May digest is still claimable on
    // the same day. The May run can therefore proceed without being
    // blocked by the April backfill.
    expect(NotificationLog::query()
        ->where('academy_id', $academy->id)
        ->where('notification_type', SendUnpaidAthletesDigest::NOTIFICATION_TYPE)
        ->whereDate('sent_for_date', '2026-05-01')
        ->exists())->toBeFalse();
});

it('declares ShouldQueue so the digest dispatch does not block the artisan loop', function (): void {
    $academy = makeAcademyForUnpaid();
    $athletes = Athlete::query()->whereRaw('1=0')->get();

    $mail = new UnpaidAthletesDigestMail($academy, $athletes, 2026, 5);

    expect($mail)->toBeInstanceOf(\Illuminate\Contracts\Queue\ShouldQueue::class);
});

it('renders the body with academy name + month label + each athlete name', function (): void {
    $academy = makeAcademyForUnpaid();
    $academy->update(['name' => 'Apex Grappling Academy']);

    $mario = Athlete::factory()->create([
        'academy_id' => $academy->id,
        'status' => AthleteStatus::Active,
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);
    $luca = Athlete::factory()->create([
        'academy_id' => $academy->id,
        'status' => AthleteStatus::Active,
        'first_name' => 'Luca',
        'last_name' => 'Bianchi',
    ]);

    $athletes = Athlete::query()->whereIn('id', [$mario->id, $luca->id])->orderBy('last_name')->get();

    $rendered = new UnpaidAthletesDigestMail($academy->fresh(), $athletes, 2026, 5)->render();

    expect($rendered)->toContain('Apex Grappling Academy')
        ->and($rendered)->toContain('May 2026')
        ->and($rendered)->toContain('Mario')
        ->and($rendered)->toContain('Rossi')
        ->and($rendered)->toContain('Luca')
        ->and($rendered)->toContain('Bianchi');
});

it('returns FAILURE exit code when academies throw but keeps iterating the loop (resilience)', function (): void {
    makeAcademyForUnpaid('a@example.com');
    makeAcademyForUnpaid('b@example.com');

    $a = Academy::query()->where('id', 1)->firstOrFail();
    $b = Academy::query()->where('id', 2)->firstOrFail();
    makeAthleteForUnpaid($a);
    makeAthleteForUnpaid($b);

    $callCount = 0;
    Mail::shouldReceive('to')
        ->andReturnUsing(function () use (&$callCount): never {
            $callCount++;

            throw new \RuntimeException("queue insert failed (call #{$callCount})");
        });

    $exitCode = \Artisan::call('budojo:send-unpaid-athletes-digest');

    expect($callCount)->toBeGreaterThanOrEqual(2);
    expect($exitCode)->toBe(1);
});
