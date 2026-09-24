<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\CertificateStatus;
use Carbon\CarbonInterface;

/**
 * One rule for "is this athlete covered?" (#1732).
 *
 * The input is the athlete's **current certificate**: their live medical
 * certificate with the greatest `expires_at`, nulls last — what
 * `Athlete::scopeWithCurrentCertificateExpiry` selects in SQL, and the same
 * "latest expiry wins" rule `Document::scopeNotSuperseded` applies to the
 * expiring list. No dated certificate at all is `missing`, whatever undated
 * rows exist: an undated row says nothing about coverage.
 *
 * Whole calendar days, and the same boundaries as the client's
 * `classifyExpiry`: before today is expired, today itself is still expiring,
 * and the warning window runs through today + `EXPIRY_WARNING_DAYS`.
 */
class ResolveCertificateStatusAction
{
    /**
     * The client's `EXPIRY_WARNING_DAYS` in `expiry-status-badge.component.ts`
     * is this number in the other dialect. They must move together, or the
     * badge on an athlete and the academy's figure disagree about them.
     */
    public const EXPIRY_WARNING_DAYS = 30;

    public function execute(?CarbonInterface $currentExpiry, CarbonInterface $today): CertificateStatus
    {
        if ($currentExpiry === null) {
            return CertificateStatus::Missing;
        }

        $expiry = $currentExpiry->toDateString();
        if ($expiry < $today->toDateString()) {
            return CertificateStatus::Expired;
        }

        return $expiry <= $today->copy()->addDays(self::EXPIRY_WARNING_DAYS)->toDateString()
            ? CertificateStatus::Expiring
            : CertificateStatus::Valid;
    }
}
