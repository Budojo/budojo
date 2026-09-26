<?php

declare(strict_types=1);

use App\Actions\Notification\DeliverOwnerDigestAction;
use App\Enums\DocumentType;
use App\Mail\MedicalCertificateExpiringMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use App\Notifications\OwnerMedicalCertExpiringDigestNotification;
use App\Notifications\OwnerUnpaidAthletesDigestNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Native notifications on the desktop (#1225): the owner digests that were
 * mail-only become `notifications` rows where the runtime has no transport,
 * and `budojo:list-desktop-notifications` hands them to the Electron shell.
 */

afterEach(fn () => Carbon::setTestNow());

function ownerWithExpiringCert(): Academy
{
    $academy = Academy::factory()->for(User::factory()->create(), 'owner')->create();
    $athlete = Athlete::factory()->create(['academy_id' => $academy->id, 'first_name' => 'Mario', 'last_name' => 'Rossi']);
    Document::factory()->create([
        'athlete_id' => $athlete->id,
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => Carbon::today()->addDays(7)->toDateString(),
    ]);

    return $academy;
}

// ── DeliverOwnerDigestAction — one place decides ─────────────────────────────

it('queues the mail on a runtime that can send email', function (): void {
    config()->set('budojo.runtime', 'web');
    Mail::fake();
    $academy = ownerWithExpiringCert();
    $documents = Document::query()->with('athlete')->get();

    app(DeliverOwnerDigestAction::class)->execute(
        $academy->owner,
        new MedicalCertificateExpiringMail($academy, $documents),
        new OwnerMedicalCertExpiringDigestNotification($academy, $documents),
    );

    Mail::assertQueued(MedicalCertificateExpiringMail::class, 1);
    expect(DatabaseNotification::query()->count())->toBe(0);
});

it('writes an in-app notification instead on a runtime that cannot', function (): void {
    config()->set('budojo.runtime', 'desktop');
    Mail::fake();
    $academy = ownerWithExpiringCert();
    $documents = Document::query()->with('athlete')->get();

    app(DeliverOwnerDigestAction::class)->execute(
        $academy->owner,
        new MedicalCertificateExpiringMail($academy, $documents),
        new OwnerMedicalCertExpiringDigestNotification($academy, $documents),
    );

    Mail::assertNothingQueued();
    $row = DatabaseNotification::query()->firstOrFail();
    expect($row->notifiable_id)->toBe($academy->owner->id)
        ->and($row->data['title'])->toBe('A medical certificate is expiring')
        ->and($row->data['body'])->toBe('Mario Rossi')
        ->and($row->data['link'])->toBe('/dashboard/documents/expiring')
        ->and($row->data['kind'])->toBe(NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS);
});

// ── The commands go through it ───────────────────────────────────────────────

it('turns the certificate digest into a notification row on the desktop, once', function (): void {
    // The command's notification_log claim still dedupes: a second run the same
    // day must not toast the owner twice.
    config()->set('budojo.runtime', 'desktop');
    Mail::fake();
    ownerWithExpiringCert();

    Artisan::call('budojo:send-medical-cert-expiry-reminders');
    Artisan::call('budojo:send-medical-cert-expiry-reminders');

    Mail::assertNothingQueued();
    expect(DatabaseNotification::query()->count())->toBe(1);
});

it('still respects the owner opt-out on the desktop', function (): void {
    // The preference gate sits before delivery in the command; a channel
    // change must not route around it.
    config()->set('budojo.runtime', 'desktop');
    $academy = ownerWithExpiringCert();
    NotificationPreferences::update($academy->owner, [NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false]);

    Artisan::call('budojo:send-medical-cert-expiry-reminders');

    expect(DatabaseNotification::query()->count())->toBe(0);
});

it('turns the unpaid digest into a notification row on the desktop', function (): void {
    config()->set('budojo.runtime', 'desktop');
    Mail::fake();
    Carbon::setTestNow(Carbon::parse('2026-08-16 10:00:00'));
    $academy = Academy::factory()->for(User::factory()->create(), 'owner')->create(['monthly_fee_cents' => 5000]);
    Athlete::factory()->create(['academy_id' => $academy->id, 'status' => 'active', 'first_name' => 'Anna', 'last_name' => 'Bianchi']);

    Artisan::call('budojo:send-unpaid-athletes-digest');

    Mail::assertNothingQueued();
    $row = DatabaseNotification::query()->firstOrFail();
    expect($row->type)->toBe(OwnerUnpaidAthletesDigestNotification::class)
        ->and($row->data['title'])->toBe('1 athlete has not paid this month')
        ->and($row->data['body'])->toBe('Anna Bianchi')
        // The roster reads `paid=yes|no`; `0` opened everybody (#1913).
        ->and($row->data['link'])->toBe('/dashboard/athletes?paid=no');
});

// ── budojo:list-desktop-notifications ────────────────────────────────────────

it('lists owner notifications newer than the watermark, oldest first, as JSON', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $academy = ownerWithExpiringCert();
    $owner = $academy->owner;
    $documents = Document::query()->with('athlete')->get();

    Carbon::setTestNow(Carbon::parse('2026-08-15 09:00:00'));
    $owner->notify(new OwnerMedicalCertExpiringDigestNotification($academy, $documents));
    Carbon::setTestNow(Carbon::parse('2026-08-15 09:10:00'));
    $owner->notify(new OwnerUnpaidAthletesDigestNotification($academy, Athlete::query()->get(), 2026, 8));

    Artisan::call('budojo:list-desktop-notifications', ['--after' => '2026-08-15T09:05:00+00:00']);
    $rows = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

    expect($rows)->toHaveCount(1)
        // Written from the row's parameters in the owner's language (#1912),
        // English for an owner who never chose one.
        ->and($rows[0]['title'])->toBe("1 athlete hasn't paid August's fee yet")
        ->and($rows[0]['link'])->toBe('/dashboard/athletes?paid=no')
        ->and($rows[0]['created_at'])->toBe('2026-08-15T09:10:00+00:00')
        ->and($rows[0]['id'])->toBeString();

    Artisan::call('budojo:list-desktop-notifications', ['--after' => '2026-08-15T08:00:00+00:00']);
    $all = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);
    expect(array_column($all, 'title'))->toBe(['A medical certificate is expiring', "1 athlete hasn't paid August's fee yet"]);
});

it('excludes athlete-side rows and rows without a title', function (): void {
    // An athlete's notification (their own account) is not the owner's toast;
    // a row with no title has nothing to show and would render as an empty box.
    $academy = ownerWithExpiringCert();
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $documents = Document::query()->with('athlete')->get();
    Carbon::setTestNow(Carbon::parse('2026-08-15 09:00:00'));
    $athleteUser->notify(new OwnerMedicalCertExpiringDigestNotification($academy, $documents));
    DatabaseNotification::query()->create([
        'id' => (string) \Illuminate\Support\Str::uuid(),
        'type' => 'App\Notifications\Untitled',
        'notifiable_type' => User::class,
        'notifiable_id' => $academy->owner->id,
        'data' => ['kind' => 'x'],
    ]);

    Artisan::call('budojo:list-desktop-notifications', ['--after' => '2026-08-15T08:00:00+00:00']);

    expect(json_decode(Artisan::output(), true))->toBe([]);
});

it('rejects a malformed watermark loudly', function (): void {
    expect(Artisan::call('budojo:list-desktop-notifications', ['--after' => 'yesterday-ish']))->toBe(2);
});

it('points the unpaid digests already in an inbox at the unpaid filter (#1913)', function (): void {
    $owner = User::factory()->create();
    $owner->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => OwnerUnpaidAthletesDigestNotification::class,
        'data' => ['kind' => 'unpaid_athletes_digest', 'title' => 't', 'body' => 'b', 'link' => '/dashboard/athletes?paid=0'],
    ]);
    $owner->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => 'App\Notifications\SomethingElse',
        'data' => ['kind' => 'owner_athlete_missed_streak', 'title' => 't', 'body' => 'b', 'link' => '/dashboard/athletes/7'],
    ]);

    (require database_path('migrations/2026_09_26_140000_point_unpaid_digests_at_the_unpaid_filter.php'))->up();

    $links = $owner->notifications()->get()->mapWithKeys(fn (DatabaseNotification $n): array => [(string) $n->data['kind'] => $n->data['link']]);
    expect($links['unpaid_athletes_digest'])->toBe('/dashboard/athletes?paid=no')
        // Only the digest moves; every other kind keeps its own link.
        ->and($links['owner_athlete_missed_streak'])->toBe('/dashboard/athletes/7');
});
