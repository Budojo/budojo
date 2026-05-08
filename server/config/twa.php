<?php

declare(strict_types=1);

/**
 * Trusted Web Activity (TWA) — Android app distribution config.
 *
 * The TWA shell wraps the Budojo PWA into a Play Store-distributable APK
 * (M9 milestone). For Chrome to enter fullscreen mode (no URL bar) the
 * web origin must serve `/.well-known/assetlinks.json` with a Digital
 * Asset Links record that ties this origin to the Android app's
 * package + signing fingerprint.
 *
 * Both `package_name` and `sha256_fingerprints` come from the keystore
 * generation step of M9 (issue #502). Until those are produced, the
 * assetlinks endpoint serves an empty array `[]` — Chrome falls back to
 * showing the URL bar but the app still works (degraded fullscreen).
 *
 * `sha256_fingerprints` is a list because Play App Signing adds a
 * SECOND fingerprint (the upload key + the Play-managed key) once the
 * app is enrolled — both must validate against the assetlinks record.
 * Comma-separate in `.env`:
 *
 *   TWA_SHA256_FINGERPRINTS=AA:BB:...:99,11:22:...:88
 */
return [
    /*
    |--------------------------------------------------------------------------
    | Android package name
    |--------------------------------------------------------------------------
    |
    | Reverse-DNS of the production web origin. MUST match the Android
    | app's `applicationId` in `mobile-android/app/build.gradle`.
    |
    */
    'package_name' => env('TWA_PACKAGE_NAME', 'it.budojo.app'),

    /*
    |--------------------------------------------------------------------------
    | SHA-256 signing fingerprints
    |--------------------------------------------------------------------------
    |
    | Comma-separated list of SHA-256 fingerprints (uppercase hex with
    | colon separators). Each entry validates one signing key:
    |
    |   - The upload key extracted from our keystore (#502).
    |   - The Play-managed key Google generates on Play App Signing
    |     enrolment (#508).
    |
    | Empty list ⇒ assetlinks endpoint returns `[]` ⇒ TWA renders with
    | the URL bar visible (still functional, just not fullscreen).
    |
    */
    'sha256_fingerprints' => array_values(array_filter(
        array_map('trim', explode(',', (string) env('TWA_SHA256_FINGERPRINTS', ''))),
        static fn (string $fp): bool => $fp !== '',
    )),
];
