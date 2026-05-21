<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AuditEntry;
use App\Models\Document;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    AuditEntry::query()->delete();
});

// ─── AthletePaymentAuditObserver ────────────────────────────────────

it('writes payment.created with the "Mario Rossi — 2026-05" label', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    AthletePayment::factory()->for($mario)->create([
        'year' => 2026,
        'month' => 5,
        'amount_cents' => 5000,
    ]);

    $entry = AuditEntry::query()->where('action', 'payment.created')->first();
    expect($entry)->not->toBeNull();
    expect($entry->subject_type)->toBe(AthletePayment::class);
    expect($entry->subject_label)->toBe('Mario Rossi — 2026-05');
    expect($entry->academy_id)->toBe($user->academy->id);
    expect($entry->after['amount_cents'])->toBe(5000);
});

it('writes payment.updated with the diff', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create();
    $payment = AthletePayment::factory()->for($mario)->create(['amount_cents' => 5000]);

    AuditEntry::query()->delete();
    $payment->amount_cents = 6000;
    $payment->save();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('payment.updated');
    expect($entry->before['amount_cents'])->toBe(5000);
    expect($entry->after['amount_cents'])->toBe(6000);
});

it('writes payment.deleted with the pre-deletion snapshot', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create();
    $payment = AthletePayment::factory()->for($mario)->create();

    AuditEntry::query()->delete();
    $payment->delete();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('payment.deleted');
    expect($entry->before)->toBeArray();
});

// ─── DocumentAuditObserver ──────────────────────────────────────────

it('writes document.uploaded with the "<filename> (<athlete-name>)" label', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    Document::factory()->for($mario)->create([
        'original_name' => 'medical-cert.pdf',
    ]);

    $entry = AuditEntry::query()->where('action', 'document.uploaded')->first();
    expect($entry)->not->toBeNull();
    expect($entry->subject_type)->toBe(Document::class);
    expect($entry->subject_label)->toBe('medical-cert.pdf (Mario Rossi)');
});

it('writes document.deleted on soft-delete', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create();
    $doc = Document::factory()->for($mario)->create();

    AuditEntry::query()->delete();
    $doc->delete();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('document.deleted');
});

// ─── AcademyAuditObserver ───────────────────────────────────────────

it('writes academy.updated when a non-logo field changes', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $academy = $user->academy;

    AuditEntry::query()->delete();
    $academy->name = 'New Academy Name';
    $academy->save();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('academy.updated');
    expect($entry->subject_type)->toBe(Academy::class);
    expect($entry->after['name'])->toBe('New Academy Name');
});

it('writes academy.logo.replaced when the logo_path column changes', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $academy = $user->academy;

    AuditEntry::query()->delete();
    $academy->logo_path = 'academies/new-logo.png';
    $academy->save();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('academy.logo.replaced');
});

// PII redaction wiring is already covered by the athlete observer
// spec (email field hashed on the `created` snapshot).
