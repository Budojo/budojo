<?php

declare(strict_types=1);

use App\Mail\AthleteInvitationMail;
use Illuminate\Support\Carbon;

/**
 * #1973 — the mail said "valid for 1 days" for every invitation. In Carbon 3
 * `$expiresAt->diffInDays(today)` is negative for a date in the future, and
 * `max(1, …)` turned every negative into 1.
 */
afterEach(fn () => Carbon::setTestNow());

function invitationExpiringAt(Carbon $expiresAt): AthleteInvitationMail
{
    return new AthleteInvitationMail('token', 'Mario Rossi', 'Budojo BJJ', 'Matteo', $expiresAt);
}

it('says how many days the link is really valid for', function (): void {
    Carbon::setTestNow('2026-09-27 10:00:00');

    $mail = invitationExpiringAt(Carbon::parse('2026-10-04 10:00:00'));

    expect($mail->content()->with['expiryDays'])->toBe(7);
});

it('counts days from the owner\'s today, even after midnight in Rome', function (): void {
    // 22:30 UTC is already the 28th in Rome: a week from the send is 7 days
    // of the owner's calendar, not 8.
    Carbon::setTestNow('2026-09-27 22:30:00');

    $mail = invitationExpiringAt(Carbon::parse('2026-10-04 22:30:00'));

    expect($mail->content()->with['expiryDays'])->toBe(7);
});

it('never promises less than one day', function (): void {
    Carbon::setTestNow('2026-09-27 10:00:00');

    $mail = invitationExpiringAt(Carbon::parse('2026-09-27 18:00:00'));

    expect($mail->content()->with['expiryDays'])->toBe(1);
});
