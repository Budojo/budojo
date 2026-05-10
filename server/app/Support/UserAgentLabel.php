<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Coarse "human-readable device label" derived from a request's
 * `User-Agent` header (#413). Used to populate
 * `personal_access_tokens.name` at login / register / accept-invite
 * time so the user's "Active sessions" list reads as
 * "Chrome on macOS — last used 2 hours ago" instead of an opaque
 * `auth` identifier.
 *
 * **Intentionally coarse.** "Chrome on macOS" not
 * "Chrome 119.0.6045 on macOS 14.1.2 Sonoma" — the user reading the
 * list cares about "is this me?" at-a-glance, not telemetry-grade
 * fingerprinting. A version drift (Chrome 118 → 119 between two
 * tabs) shouldn't fragment the row count either.
 *
 * **Not a security boundary.** The label is informational only; the
 * actual session credential is the Sanctum token. A spoofed UA
 * produces a wrong label (Chrome shown when the caller was curl)
 * but cannot bypass any auth check.
 *
 * **No external dep.** A handful of `str_contains()` checks against
 * the seven browser / four OS combinations we ship to today is
 * cheaper to maintain than an agent-detection package. The fallback
 * is "Unknown device" — every UA that doesn't match a known shape
 * lands in that bucket so the column always reads something.
 */
final class UserAgentLabel
{
    private const FALLBACK = 'Unknown device';
    private const MAX_LENGTH = 80;

    public static function fromUserAgent(string $userAgent): string
    {
        if ($userAgent === '') {
            return self::FALLBACK;
        }

        $browser = self::detectBrowser($userAgent);
        $os = self::detectOs($userAgent);

        if ($browser === null || $os === null) {
            return self::FALLBACK;
        }

        $label = "{$browser} on {$os}";

        // Defense-in-depth cap. The composed label from our
        // vocabulary tops out around 20 chars; the cap exists so a
        // future contribution that passes raw UA fragments through
        // can't bloat the column.
        if (\strlen($label) > self::MAX_LENGTH) {
            return substr($label, 0, self::MAX_LENGTH);
        }

        return $label;
    }

    /**
     * Order matters: Edge (Chromium) ships with both `Edg/` and
     * `Chrome/`, so we must check Edge before Chrome to surface the
     * more specific brand. Same for the future Brave / Vivaldi etc.
     * — those would each get their own check above the Chrome
     * fall-through.
     */
    private static function detectBrowser(string $ua): ?string
    {
        if (str_contains($ua, 'Edg/')) {
            return 'Edge';
        }

        if (str_contains($ua, 'Firefox/')) {
            return 'Firefox';
        }

        if (str_contains($ua, 'Chrome/')) {
            return 'Chrome';
        }

        // Safari is identified by the absence of the above tokens AND
        // the presence of the `Safari/` token (which Chrome / Edge
        // also include for legacy reasons — hence the fall-through
        // ordering).
        if (str_contains($ua, 'Safari/')) {
            return 'Safari';
        }

        return null;
    }

    private static function detectOs(string $ua): ?string
    {
        // iPhone / iPad share the Mobile WebKit shape — bucket both
        // as "iOS" so a user who logs in from both their phone and
        // their tablet doesn't have to mentally translate
        // "iPadOS" vs "iOS" (which Apple itself made fuzzy in 13+).
        if (str_contains($ua, 'iPhone') || str_contains($ua, 'iPad')) {
            return 'iOS';
        }

        // Android must be checked BEFORE Linux — Android UAs include
        // `Linux` in the platform string so a naive Linux check would
        // mis-bucket every Android user.
        if (str_contains($ua, 'Android')) {
            return 'Android';
        }

        if (str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS X')) {
            return 'macOS';
        }

        if (str_contains($ua, 'Windows')) {
            return 'Windows';
        }

        if (str_contains($ua, 'Linux')) {
            return 'Linux';
        }

        return null;
    }
}
