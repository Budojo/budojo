<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Catalog of onboarding-checklist step keys (#424).
 *
 * Single source of truth for the SPA + backend: the request validator
 * uses `OnboardingStep::all()` as the `Rule::in(...)` allowlist, the
 * SPA reads the same set from `OnboardingService.STEPS`, and the
 * "Getting started" checklist renders one card per key.
 *
 * Ordering here is the SPA's display order — DO rearrange when a
 * step's natural sequence in the product flow changes, since the
 * checklist iterates this list as-is.
 *
 * Adding a step: append the new key here AND mirror it in
 * `client/src/app/core/services/onboarding.service.ts` STEPS const
 * AND add an i18n entry under `onboarding.steps.<key>` in EN+IT.
 * A vitest parity check (`onboarding.service.spec.ts`) keeps the
 * lists in lock-step.
 */
final class OnboardingStep
{
    public const string ADD_ATHLETE = 'add_athlete';
    public const string LOG_ATTENDANCE = 'log_attendance';
    public const string MARK_PAYMENT = 'mark_payment';
    public const string UPLOAD_DOCUMENT = 'upload_document';
    public const string VIEW_STATS = 'view_stats';

    /** @return array<int, string> */
    public static function all(): array
    {
        return [
            self::ADD_ATHLETE,
            self::LOG_ATTENDANCE,
            self::MARK_PAYMENT,
            self::UPLOAD_DOCUMENT,
            self::VIEW_STATS,
        ];
    }
}
