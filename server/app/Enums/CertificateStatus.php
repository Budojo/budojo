<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * An athlete's medical-certificate status (#1732) — an answer about a person,
 * resolved from their current certificate by `ResolveCertificateStatusAction`.
 *
 * The client's `ExpiryStatus` has the same four words plus `none`, which is a
 * per-row state for document types that carry no expiry, not an answer about
 * an athlete.
 */
enum CertificateStatus: string
{
    case Valid = 'valid';
    /** Covered today, lapsing within the warning window. */
    case Expiring = 'expiring';
    case Expired = 'expired';
    /** No live medical certificate with an expiry date. */
    case Missing = 'missing';
}
