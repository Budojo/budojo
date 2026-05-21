<?php

declare(strict_types=1);

use App\Support\Audit\PiiRedactor;

it('hashes email to an 8-char SHA-256 prefix + "..."', function (): void {
    $redactor = new PiiRedactor();
    $result = $redactor->redact(['email' => 'mario@example.com']);

    $expected = mb_substr(hash('sha256', 'mario@example.com'), 0, 8) . '...';
    expect($result['email'])->toBe($expected);
});

it('partial-masks a fiscal code to "***" + last 4 chars', function (): void {
    $redactor = new PiiRedactor();
    $result = $redactor->redact(['fiscal_code' => 'RSSMRA80A01H501Z']);

    expect($result['fiscal_code'])->toBe('***501Z');
});

it('omits address-like fields with the literal <redacted> sentinel', function (): void {
    $redactor = new PiiRedactor();
    $result = $redactor->redact([
        'address' => '123 Main St',
        'street' => 'Via Roma 1',
        'notes' => 'private memo',
    ]);

    expect($result['address'])->toBe('<redacted>');
    expect($result['street'])->toBe('<redacted>');
    expect($result['notes'])->toBe('<redacted>');
});

it('passes through fields that aren\'t PII (id, belt, status, timestamps)', function (): void {
    $redactor = new PiiRedactor();
    $result = $redactor->redact([
        'id' => 42,
        'belt' => 'blue',
        'status' => 'active',
        'created_at' => '2026-05-21T08:00:00Z',
    ]);

    expect($result)->toMatchArray([
        'id' => 42,
        'belt' => 'blue',
        'status' => 'active',
        'created_at' => '2026-05-21T08:00:00Z',
    ]);
});

it('preserves null + empty string values verbatim (no hash of nothing)', function (): void {
    $redactor = new PiiRedactor();
    $result = $redactor->redact(['email' => null, 'phone_national_number' => '']);

    expect($result['email'])->toBeNull();
    expect($result['phone_national_number'])->toBe('');
});
