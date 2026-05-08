<?php

declare(strict_types=1);

/*
 * Pins the contract of `/.well-known/assetlinks.json` — the
 * Digital Asset Links endpoint Chrome uses to validate the
 * Android TWA shell. Three states:
 *
 *   1. No package + no fingerprints (empty TWA config) → 200 with `[]`.
 *      The route exists but has nothing to claim — TWA still launches,
 *      just without fullscreen mode.
 *   2. Package + fingerprints present → 200 with the asset-links
 *      statement matching the spec.
 *   3. Multiple fingerprints (Play App Signing case) → all
 *      fingerprints land in the `sha256_cert_fingerprints` array
 *      in the same order they were configured.
 */

it('returns an empty list when no fingerprints are configured', function (): void {
    config([
        'twa.package_name' => 'it.budojo.app',
        'twa.sha256_fingerprints' => [],
    ]);

    $response = $this->getJson('/.well-known/assetlinks.json');

    $response->assertStatus(200);
    $response->assertExactJson([]);
});

it('returns an empty list when the package name is missing', function (): void {
    config([
        'twa.package_name' => '',
        'twa.sha256_fingerprints' => ['AA:BB:CC'],
    ]);

    $response = $this->getJson('/.well-known/assetlinks.json');

    $response->assertStatus(200);
    $response->assertExactJson([]);
});

it('returns the canonical asset-links statement when configured', function (): void {
    config([
        'twa.package_name' => 'it.budojo.app',
        'twa.sha256_fingerprints' => [
            'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        ],
    ]);

    $response = $this->getJson('/.well-known/assetlinks.json');

    $response->assertStatus(200);
    $response->assertExactJson([
        [
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => [
                'namespace' => 'android_app',
                'package_name' => 'it.budojo.app',
                'sha256_cert_fingerprints' => [
                    'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
                ],
            ],
        ],
    ]);
});

it('renders both fingerprints when Play App Signing has added a second one', function (): void {
    // After Play App Signing enrolment the assetlinks file carries the
    // upload-key fingerprint AND the Play-managed key fingerprint —
    // both must validate against incoming TWA launches. Asserting the
    // exact body (not just the count) so the order + values are pinned.
    $uploadKey = '11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11';
    $playKey = '22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22:22';

    config([
        'twa.package_name' => 'it.budojo.app',
        'twa.sha256_fingerprints' => [$uploadKey, $playKey],
    ]);

    $response = $this->getJson('/.well-known/assetlinks.json');

    $response->assertStatus(200);
    $response->assertExactJson([
        [
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => [
                'namespace' => 'android_app',
                'package_name' => 'it.budojo.app',
                'sha256_cert_fingerprints' => [$uploadKey, $playKey],
            ],
        ],
    ]);
});

it('responds with application/json content type', function (): void {
    config([
        'twa.package_name' => 'it.budojo.app',
        'twa.sha256_fingerprints' => [],
    ]);

    $response = $this->getJson('/.well-known/assetlinks.json');

    expect($response->headers->get('content-type'))->toContain('application/json');
});

it('does not require authentication', function (): void {
    // The endpoint is public — Chrome fetches it before any session
    // exists. A 401 / 302 here would defeat the whole purpose.
    config([
        'twa.package_name' => 'it.budojo.app',
        'twa.sha256_fingerprints' => [],
    ]);

    $response = $this->get('/.well-known/assetlinks.json');

    $response->assertStatus(200);
});
