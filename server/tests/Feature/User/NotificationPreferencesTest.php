<?php

declare(strict_types=1);

use App\Mail\MedicalCertificateExpiringMail;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// ─── Helper ────────────────────────────────────────────────────────────────────

it('NotificationPreferences::isEnabled defaults to true on a fresh user (null column)', function (): void {
    $user = User::factory()->create();
    expect($user->notification_preferences)->toBeNull();
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS))
        ->toBeTrue();
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::UNPAID_ATHLETES_DIGEST))
        ->toBeTrue();
});

it('NotificationPreferences::isEnabled honors explicit false', function (): void {
    $user = User::factory()->create([
        'notification_preferences' => [
            NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
        ],
    ]);
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS))
        ->toBeFalse();
    // Other category absent → still enabled by default.
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::UNPAID_ATHLETES_DIGEST))
        ->toBeTrue();
});

it('NotificationPreferences::update merges, lowercases unknown keys, persists', function (): void {
    $user = User::factory()->create();

    NotificationPreferences::update($user, [
        NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
        'unknown_category' => true, // silently dropped
    ]);

    $user->refresh();
    expect($user->notification_preferences)->toBe([
        NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
    ]);
});

// ─── GET /me/notification-preferences ─────────────────────────────────────────

it('GET /me/notification-preferences returns all categories enabled by default', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->getJson('/api/v1/me/notification-preferences');

    $response->assertOk()->assertJson([
        'data' => [
            NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => true,
            NotificationCategory::UNPAID_ATHLETES_DIGEST => true,
        ],
    ]);
});

it('GET /me/notification-preferences reflects an explicit opt-out', function (): void {
    $user = userWithAcademy();
    $user->update([
        'notification_preferences' => [
            NotificationCategory::UNPAID_ATHLETES_DIGEST => false,
        ],
    ]);

    $response = $this->actingAs($user)->getJson('/api/v1/me/notification-preferences');

    $response->assertOk()->assertJsonPath('data.' . NotificationCategory::UNPAID_ATHLETES_DIGEST, false);
    $response->assertJsonPath('data.' . NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS, true);
});

it('GET /me/notification-preferences requires authentication', function (): void {
    $this->getJson('/api/v1/me/notification-preferences')->assertUnauthorized();
});

// ─── PATCH /me/notification-preferences ───────────────────────────────────────

it('PATCH /me/notification-preferences updates one category and echoes the snapshot', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->patchJson('/api/v1/me/notification-preferences', [
        'preferences' => [
            NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
        ],
    ]);

    $response->assertOk()
        ->assertJsonPath('data.' . NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS, false)
        ->assertJsonPath('data.' . NotificationCategory::UNPAID_ATHLETES_DIGEST, true);

    $user->refresh();
    expect($user->notification_preferences)->toBe([
        NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
    ]);
});

it('PATCH rejects unknown categories with 422', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->patchJson('/api/v1/me/notification-preferences', [
        'preferences' => [
            'totally_unknown_category' => false,
        ],
    ]);

    $response->assertUnprocessable();
    expect($user->refresh()->notification_preferences)->toBeNull();
});

it('PATCH rejects non-boolean values with 422', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->patchJson('/api/v1/me/notification-preferences', [
        'preferences' => [
            NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => 'yes-please',
        ],
    ])->assertUnprocessable();
});

// ─── Dispatcher gates ─────────────────────────────────────────────────────────

it('SendMedicalCertExpiryReminders skips owners who opted out of the category', function (): void {
    Mail::fake();

    [$optedOut, $optedIn] = createTwoAcademiesWithExpiringCerts();
    $optedOut->owner->update([
        'notification_preferences' => [
            NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS => false,
        ],
    ]);

    $this->artisan('budojo:send-medical-cert-expiry-reminders')->assertExitCode(0);

    Mail::assertQueued(MedicalCertificateExpiringMail::class, 1);
    Mail::assertQueued(
        MedicalCertificateExpiringMail::class,
        fn (MedicalCertificateExpiringMail $mail) => $mail->hasTo($optedIn->owner->email),
    );
    Mail::assertNotQueued(
        MedicalCertificateExpiringMail::class,
        fn (MedicalCertificateExpiringMail $mail) => $mail->hasTo($optedOut->owner->email),
    );
});

it('SendUnpaidAthletesDigest skips owners who opted out of the category', function (): void {
    Mail::fake();

    [$optedOut, $optedIn] = createTwoAcademiesWithUnpaidAthletes();
    $optedOut->owner->update([
        'notification_preferences' => [
            NotificationCategory::UNPAID_ATHLETES_DIGEST => false,
        ],
    ]);

    $this->artisan('budojo:send-unpaid-athletes-digest --year='
        . Carbon::now()->year . ' --month=' . Carbon::now()->month)
        ->assertExitCode(0);

    Mail::assertQueued(UnpaidAthletesDigestMail::class, 1);
    Mail::assertQueued(
        UnpaidAthletesDigestMail::class,
        fn (UnpaidAthletesDigestMail $mail) => $mail->hasTo($optedIn->owner->email),
    );
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** @return array{0: Academy, 1: Academy} */
function createTwoAcademiesWithExpiringCerts(): array
{
    $a = Academy::factory()->create();
    $b = Academy::factory()->create();
    foreach ([$a, $b] as $academy) {
        $athlete = Athlete::factory()->for($academy)->create();
        Document::factory()->for($athlete)->create([
            'type' => \App\Enums\DocumentType::MedicalCertificate,
            'expires_at' => Carbon::today()->addDays(7), // T-7 reminder window
        ]);
    }

    return [$a, $b];
}

/** @return array{0: Academy, 1: Academy} */
function createTwoAcademiesWithUnpaidAthletes(): array
{
    // The digest's selector requires `Academy.monthly_fee_cents` set
    // (NULL is treated as "off-platform / cash" and the academy is
    // skipped) AND at least one active athlete with no payment row
    // for the current month.
    $a = Academy::factory()->create(['monthly_fee_cents' => 5000]);
    $b = Academy::factory()->create(['monthly_fee_cents' => 5000]);
    foreach ([$a, $b] as $academy) {
        Athlete::factory()->for($academy)->create([
            'status' => \App\Enums\AthleteStatus::Active,
        ]);
        // No payment row → athlete is "unpaid for the current
        // month" per the dispatcher's `whereDoesntHave('payments')`
        // selector.
    }

    return [$a, $b];
}
