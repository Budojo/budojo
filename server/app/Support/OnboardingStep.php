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
 * `client/src/app/core/services/onboarding.service.ts` (the
 * exported `ONBOARDING_STEPS` const) AND add an i18n entry under
 * `onboarding.steps.<key>` in EN+IT, plus the STEP_LABEL_KEY /
 * STEP_HINT_KEY static maps in `onboarding-checklist.component.ts`.
 * A vitest parity check (`onboarding.service.spec.ts`) keeps the
 * lists in lock-step.
 */
final class OnboardingStep
{
    public const string ADD_ATHLETE = 'add_athlete';
    /**
     * The two the check-in depends on (#1649). Both were missing while the
     * daily check-in had come to rest on them: it proposes the classes on
     * today's timetable, and a lesson's topics come from the programme. An
     * owner who followed the checklist to the end still had neither, and the
     * screen that needed them said nothing about it.
     */
    public const string SET_TIMETABLE = 'set_timetable';
    public const string WRITE_SYLLABUS = 'write_syllabus';
    public const string LOG_ATTENDANCE = 'log_attendance';
    public const string MARK_PAYMENT = 'mark_payment';
    public const string UPLOAD_DOCUMENT = 'upload_document';
    public const string VIEW_STATS = 'view_stats';

    /** @return array<int, string> */
    public static function all(): array
    {
        return [
            self::ADD_ATHLETE,
            // Before logging attendance, because that is the order they are
            // needed in: the check-in proposes today's classes.
            self::SET_TIMETABLE,
            self::WRITE_SYLLABUS,
            self::LOG_ATTENDANCE,
            self::MARK_PAYMENT,
            self::UPLOAD_DOCUMENT,
            self::VIEW_STATS,
        ];
    }
}
