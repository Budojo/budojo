<?php

declare(strict_types=1);

use App\Actions\Document\ResolveCertificateStatusAction;
use App\Enums\CertificateStatus;
use Carbon\CarbonImmutable;

/**
 * An athlete's certificate status from their current certificate's expiry
 * (#1732). The same boundaries as the client's `classifyExpiry`: a day before
 * today is expired, today itself is still expiring, and the warning window
 * runs through today + 30 inclusive.
 */
it('reads the current certificate expiry as one of four answers', function (?string $expiresAt, CertificateStatus $expected): void {
    $today = CarbonImmutable::parse('2026-09-24');
    $expiry = $expiresAt === null ? null : CarbonImmutable::parse($expiresAt);

    expect(new ResolveCertificateStatusAction()->execute($expiry, $today))->toBe($expected);
})->with([
    'no dated certificate' => [null, CertificateStatus::Missing],
    'expired yesterday' => ['2026-09-23', CertificateStatus::Expired],
    'expired years ago' => ['2024-01-10', CertificateStatus::Expired],
    'expires today' => ['2026-09-24', CertificateStatus::Expiring],
    'expires in 30 days' => ['2026-10-24', CertificateStatus::Expiring],
    'expires in 31 days' => ['2026-10-25', CertificateStatus::Valid],
    'expires next year' => ['2027-06-01', CertificateStatus::Valid],
]);

it('ignores the time of day on either side', function (): void {
    // `expires_at` comes back from a `date` cast at midnight, and "today" may
    // be read at 23:59 — a certificate expiring today is still expiring.
    $action = new ResolveCertificateStatusAction();

    expect($action->execute(CarbonImmutable::parse('2026-09-24 00:00:00'), CarbonImmutable::parse('2026-09-24 23:59:00')))
        ->toBe(CertificateStatus::Expiring);
});
