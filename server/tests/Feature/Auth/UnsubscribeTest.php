<?php

declare(strict_types=1);

use App\Mail\MedicalCertificateExpiringMail;
use App\Models\User;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\UnsubscribeUrl;
use Illuminate\Support\Facades\URL;

// ─── Signed URL helper ────────────────────────────────────────────────────────

it('UnsubscribeUrl::for builds a signed temporary route to the user + category', function (): void {
    $user = User::factory()->create();
    $url = UnsubscribeUrl::for($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS);

    expect($url)->toContain("/unsubscribe/{$user->id}/medical_cert_expiry_reminders");
    expect($url)->toContain('signature=');
    expect($url)->toContain('expires=');
});

// ─── GET /unsubscribe/{userId}/{category} ─────────────────────────────────────

it('GET unsubscribe with a valid signature flips the preference off and redirects to /unsubscribed', function (): void {
    $user = User::factory()->create();
    $url = UnsubscribeUrl::for($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS);

    $response = $this->get($url);

    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('/unsubscribed?category=medical_cert_expiry_reminders');

    $user->refresh();
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS))
        ->toBeFalse();
    // Other categories untouched.
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::UNPAID_ATHLETES_DIGEST))
        ->toBeTrue();
});

it('GET unsubscribe with a tampered signature returns 403 from the signed middleware', function (): void {
    $user = User::factory()->create();
    $url = UnsubscribeUrl::for($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS) . '&tampered=yes';

    $response = $this->get($url);
    $response->assertForbidden();

    // Preference unchanged.
    $user->refresh();
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS))
        ->toBeTrue();
});

it('GET unsubscribe redirects to status=invalid when the user no longer exists', function (): void {
    $user = User::factory()->create();
    $url = UnsubscribeUrl::for($user, NotificationCategory::MEDICAL_CERT_EXPIRY_REMINDERS);
    $user->delete();

    $response = $this->get($url);
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('/unsubscribed?status=invalid');
});

it('GET unsubscribe redirects to status=invalid for unknown category', function (): void {
    $user = User::factory()->create();
    // Build a signed URL with a category we no longer recognize. Use
    // the same signing helper so the signature itself is valid; the
    // controller should still reject the unknown key.
    $url = URL::signedRoute('unsubscribe', [
        'userId' => $user->id,
        'category' => 'totally_unknown',
    ]);

    $response = $this->get($url);
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('/unsubscribed?status=invalid');
});

it('GET unsubscribe rejects non-numeric userId at the route layer (404)', function (): void {
    $url = URL::signedRoute('unsubscribe', [
        'userId' => 'not-a-number',
        'category' => 'medical_cert_expiry_reminders',
    ]);

    $this->get($url)->assertNotFound();
});

// ─── POST /unsubscribe/{userId}/{category} (RFC 8058 one-click) ──────────────

it('POST unsubscribe (List-Unsubscribe-Post) flips the preference and returns 200', function (): void {
    $user = User::factory()->create();
    $url = UnsubscribeUrl::for($user, NotificationCategory::UNPAID_ATHLETES_DIGEST);

    // Convert the signed GET URL to its POST equivalent — the same
    // signature works for both methods. Email clients fire a no-body
    // POST when the user taps "Unsubscribe" inside the inbox UI.
    $response = $this->post($url);

    $response->assertOk();
    expect((string) $response->getContent())->toBe('');

    $user->refresh();
    expect(NotificationPreferences::isEnabled($user, NotificationCategory::UNPAID_ATHLETES_DIGEST))
        ->toBeFalse();
});

// ─── Mailable footer + List-Unsubscribe headers ───────────────────────────────

it('MedicalCertificateExpiringMail emits List-Unsubscribe + List-Unsubscribe-Post headers', function (): void {
    $academy = \App\Models\Academy::factory()->create();
    $documents = new \Illuminate\Database\Eloquent\Collection();

    $mail = new MedicalCertificateExpiringMail($academy, $documents);
    $headers = $mail->headers();

    $reflected = $headers->text;
    expect($reflected)->toHaveKey('List-Unsubscribe');
    expect($reflected)->toHaveKey('List-Unsubscribe-Post');
    expect($reflected['List-Unsubscribe'])->toMatch('#^<https?://[^>]+/unsubscribe/\d+/medical_cert_expiry_reminders\?[^>]+>$#');
    expect($reflected['List-Unsubscribe-Post'])->toBe('List-Unsubscribe=One-Click');
});

it('MedicalCertificateExpiringMail body renders a footer unsubscribe link', function (): void {
    $academy = \App\Models\Academy::factory()->create();
    $documents = new \Illuminate\Database\Eloquent\Collection();

    $rendered = new MedicalCertificateExpiringMail($academy, $documents)->render();

    expect($rendered)->toContain('Unsubscribe');
    expect($rendered)->toContain('/unsubscribe/' . $academy->owner->id . '/medical_cert_expiry_reminders');
});
