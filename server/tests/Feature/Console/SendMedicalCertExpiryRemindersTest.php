<?php

declare(strict_types=1);

use App\Console\Commands\SendMedicalCertExpiryReminders;
use App\Enums\DocumentType;
use App\Mail\MedicalCertificateExpiringMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\NotificationLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

beforeEach(function (): void {
    Mail::fake();
    Carbon::setTestNow('2026-05-04 09:00:00');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function makeAcademy(string $email = 'owner@example.com'): Academy
{
    $user = User::factory()->create(['email' => $email]);

    return Academy::factory()->for($user, 'owner')->create();
}

function makeAthleteWithCert(Academy $academy, ?Carbon $expiresAt, string $type = 'medical_certificate'): Document
{
    $athlete = Athlete::factory()->create(['academy_id' => $academy->id]);
    $documentType = $type === 'medical_certificate' ? DocumentType::MedicalCertificate : DocumentType::IdCard;

    return Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => $documentType,
        'expires_at' => $expiresAt?->toDateString(),
    ]);
}

it('queues a digest with only the certs at the T-30 / T-7 / T-0 thresholds (golden path)', function (): void {
    $academy = makeAcademy();
    $today = Carbon::today();

    // Three matching, two non-matching:
    // - T+30 (Mario)               → in digest
    // - T+7 (Luca)                 → in digest
    // - T+0 / today (Anna)         → in digest
    // - T+15 (Giulia, off-cycle)   → NOT in digest
    // - T+30 ID card not med cert  → NOT in digest (wrong type)
    makeAthleteWithCert($academy, $today->copy()->addDays(30));
    makeAthleteWithCert($academy, $today->copy()->addDays(7));
    makeAthleteWithCert($academy, $today->copy());
    makeAthleteWithCert($academy, $today->copy()->addDays(15));
    makeAthleteWithCert($academy, $today->copy()->addDays(30), 'id_card');

    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertQueued(MedicalCertificateExpiringMail::class, fn (
        MedicalCertificateExpiringMail $mail,
    ): bool => $mail->academy->id === $academy->id
            && $mail->documents->count() === 3
            && $mail->hasTo('owner@example.com'));
});

it('does not queue a mail when an academy has no certs at any trigger threshold', function (): void {
    $academy = makeAcademy();
    $today = Carbon::today();

    // All off-cycle.
    makeAthleteWithCert($academy, $today->copy()->addDays(15));
    makeAthleteWithCert($academy, $today->copy()->addDays(45));

    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertNothingQueued();
});

it('skips an academy whose digest was already sent today (de-dup via notification_log)', function (): void {
    $academy = makeAcademy();
    makeAthleteWithCert($academy, Carbon::today()->copy()->addDays(7));

    // Pre-seed the log row for today — simulates the 09:00 cron
    // already having sent the digest. A manual re-run by an oncall
    // should NOT spam the academy.
    NotificationLog::query()->create([
        'academy_id' => $academy->id,
        'notification_type' => SendMedicalCertExpiryReminders::NOTIFICATION_TYPE,
        'sent_for_date' => Carbon::today()->toDateString(),
    ]);

    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertNothingQueued();
});

it('--force re-sends even when notification_log already has a row for today', function (): void {
    $academy = makeAcademy();
    makeAthleteWithCert($academy, Carbon::today()->copy()->addDays(7));

    NotificationLog::query()->create([
        'academy_id' => $academy->id,
        'notification_type' => SendMedicalCertExpiryReminders::NOTIFICATION_TYPE,
        'sent_for_date' => Carbon::today()->toDateString(),
    ]);

    \Artisan::call('budojo:send-medical-cert-expiry-reminders', ['--force' => true]);

    Mail::assertQueued(MedicalCertificateExpiringMail::class, 1);
});

it('records a notification_log row after the queue insert (so the next run skips)', function (): void {
    $academy = makeAcademy();
    makeAthleteWithCert($academy, Carbon::today()->copy()->addDays(7));

    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    expect(NotificationLog::query()
        ->where('academy_id', $academy->id)
        ->where('notification_type', SendMedicalCertExpiryReminders::NOTIFICATION_TYPE)
        ->whereDate('sent_for_date', Carbon::today())
        ->exists())
        ->toBeTrue();

    // Second run on the same day must be a no-op — proves the de-dup
    // is end-to-end (insert wired correctly, query wired correctly).
    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertQueued(MedicalCertificateExpiringMail::class, 1);
});

it('iterates multiple academies independently — each gets its own digest', function (): void {
    $a = makeAcademy('a@example.com');
    $b = makeAcademy('b@example.com');
    $c = makeAcademy('c@example.com');

    makeAthleteWithCert($a, Carbon::today()->copy()->addDays(7));
    makeAthleteWithCert($b, Carbon::today()->copy()->addDays(30));
    // Academy c has nothing expiring — must NOT receive a mail.
    makeAthleteWithCert($c, Carbon::today()->copy()->addDays(15));

    \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertQueued(MedicalCertificateExpiringMail::class, 2);
    Mail::assertQueued(MedicalCertificateExpiringMail::class, fn (MedicalCertificateExpiringMail $m): bool => $m->hasTo('a@example.com'));
    Mail::assertQueued(MedicalCertificateExpiringMail::class, fn (MedicalCertificateExpiringMail $m): bool => $m->hasTo('b@example.com'));
    Mail::assertNotQueued(MedicalCertificateExpiringMail::class, fn (MedicalCertificateExpiringMail $m): bool => $m->hasTo('c@example.com'));
});

it('declares ShouldQueue so the digest dispatch does not block the artisan loop', function (): void {
    $academy = makeAcademy();
    $documents = Document::query()->whereRaw('1=0')->get();

    $mail = new MedicalCertificateExpiringMail($academy, $documents);

    expect($mail)->toBeInstanceOf(\Illuminate\Contracts\Queue\ShouldQueue::class);
});

it('renders the body with academy name + each athlete name + expiry date', function (): void {
    $academy = makeAcademy();
    $academy->update(['name' => 'Apex Grappling Academy']);

    // Athletes whose names should appear in the rendered table.
    $marioAthlete = Athlete::factory()->for($academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);
    $lucaAthlete = Athlete::factory()->for($academy)->create([
        'first_name' => 'Luca',
        'last_name' => 'Bianchi',
    ]);

    $marioDoc = Document::factory()->for($marioAthlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => Carbon::create(2026, 6, 3),
    ]);
    $lucaDoc = Document::factory()->for($lucaAthlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => Carbon::create(2026, 5, 11),
    ]);

    $documents = Document::query()
        ->whereIn('id', [$marioDoc->id, $lucaDoc->id])
        ->with('athlete')
        ->orderBy('expires_at', 'asc')
        ->get();

    $rendered = new MedicalCertificateExpiringMail($academy->fresh(), $documents)->render();

    expect($rendered)->toContain('Apex Grappling Academy')
        ->and($rendered)->toContain('Mario')
        ->and($rendered)->toContain('Rossi')
        ->and($rendered)->toContain('Luca')
        ->and($rendered)->toContain('Bianchi')
        ->and($rendered)->toContain('2026-05-11')
        ->and($rendered)->toContain('2026-06-03');
});

it('returns FAILURE exit code when academies throw but keeps iterating the loop (resilience)', function (): void {
    // Build two academies with expiring certs; force every queue
    // insert to throw via the Mail facade mock. The command's
    // per-academy try/catch routes each throw to report() and
    // continues, so BOTH academies are attempted (proves the loop
    // didn't bail on the first throw). The overall exit code is
    // FAILURE because at least one academy errored.
    makeAcademy('a@example.com');
    makeAcademy('b@example.com');

    $a = Academy::query()->where('id', 1)->firstOrFail();
    $b = Academy::query()->where('id', 2)->firstOrFail();
    makeAthleteWithCert($a, Carbon::today()->copy()->addDays(7));
    makeAthleteWithCert($b, Carbon::today()->copy()->addDays(7));

    $callCount = 0;
    Mail::shouldReceive('to')
        ->andReturnUsing(function () use (&$callCount): never {
            $callCount++;

            throw new \RuntimeException("queue insert failed (call #{$callCount})");
        });

    $exitCode = \Artisan::call('budojo:send-medical-cert-expiry-reminders');

    expect($callCount)->toBeGreaterThanOrEqual(2);
    expect($exitCode)->toBe(1);
});
