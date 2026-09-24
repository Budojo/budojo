<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Actions\Document\ResolveCertificateStatusAction;
use App\Enums\AthleteStatus;
use App\Enums\CertificateStatus;
use App\Models\Academy;
use Carbon\CarbonImmutable;

/**
 * How many of the academy's active athletes a medical certificate covers
 * (#1732) — counted in athletes, not rows.
 *
 * The expiring list counts paper: an athlete with three certificates is three
 * entries, and "3 expiring, 2 missing" cannot say whether that is 2 of 6 or 2
 * of 90. This is the figure an insurer or CONI asks for.
 *
 * - **Active athletes only**, the denominator the four counters sum to.
 * - **`compliance_pct`** is `(valid + expiring) / total_active`, rounded:
 *   a certificate lapsing in three weeks covers today, which is what the amber
 *   badge says too. It is **null** on an empty roster — an academy with no
 *   athletes is not compliant, it is empty.
 *
 * One query: the current expiry comes back as a correlated subquery per
 * athlete, and the rule is applied in PHP by the resolver every reader shares.
 */
class CertificateComplianceAction
{
    public function __construct(
        private readonly ResolveCertificateStatusAction $resolve,
    ) {
    }

    /**
     * @return array{total_active: int, valid: int, expiring: int, expired: int, missing: int, compliance_pct: int|null}
     */
    public function execute(Academy $academy): array
    {
        $today = CarbonImmutable::today();
        $counts = array_fill_keys(array_map(static fn (CertificateStatus $s): string => $s->value, CertificateStatus::cases()), 0);

        $expiries = $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->withCurrentCertificateExpiry()
            ->pluck('current_certificate_expires_at');

        foreach ($expiries as $expiry) {
            $current = \is_string($expiry) ? CarbonImmutable::parse($expiry) : null;
            $counts[$this->resolve->execute($current, $today)->value]++;
        }

        $total = $expiries->count();
        $covered = $counts[CertificateStatus::Valid->value] + $counts[CertificateStatus::Expiring->value];

        return [
            'total_active' => $total,
            'valid' => $counts[CertificateStatus::Valid->value],
            'expiring' => $counts[CertificateStatus::Expiring->value],
            'expired' => $counts[CertificateStatus::Expired->value],
            'missing' => $counts[CertificateStatus::Missing->value],
            'compliance_pct' => $total === 0 ? null : (int) round(($covered / $total) * 100),
        ];
    }
}
