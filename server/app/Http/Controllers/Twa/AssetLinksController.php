<?php

declare(strict_types=1);

namespace App\Http\Controllers\Twa;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Config;

/**
 * Serves `/.well-known/assetlinks.json` for the Android Trusted Web
 * Activity (TWA) shell — M9 milestone, issue #503.
 *
 * Chrome reads this file at TWA-launch time to verify the running web
 * origin is "owned" by the Android app's package + signing fingerprint.
 * On a successful verification the TWA enters fullscreen mode (no URL
 * bar visible — the user sees a native-app-like surface). On a missing
 * or wrong record the URL bar stays visible — the app still works,
 * just doesn't read as a native app.
 *
 * Spec: https://developers.google.com/digital-asset-links/v1/getting-started
 *
 * Body shape (one statement, multiple fingerprints possible):
 *
 *   [{
 *     "relation": ["delegate_permission/common.handle_all_urls"],
 *     "target": {
 *       "namespace": "android_app",
 *       "package_name": "it.budojo.app",
 *       "sha256_cert_fingerprints": [
 *         "AA:BB:...:99",
 *         "11:22:...:88"
 *       ]
 *     }
 *   }]
 *
 * `sha256_cert_fingerprints` is a LIST because Play App Signing adds a
 * second fingerprint after enrolment (the upload key fingerprint + the
 * Play-managed key fingerprint). Both must validate.
 *
 * **Empty-fingerprints behaviour.** Until issue #502 produces a
 * keystore + fingerprint, `config('twa.sha256_fingerprints')` is empty
 * and we serve `[]` (an empty asset-links statement list, valid JSON,
 * spec-compliant). Chrome falls back to URL-bar mode but the TWA
 * still launches. This lets us deploy the route to production BEFORE
 * the keystore exists, then flip the env-var when ready — no second
 * deploy needed.
 *
 * **Caching.** Chrome caches `assetlinks.json` aggressively, but a
 * fresh TWA install always fetches it. We don't set explicit caching
 * headers — the framework default (no-store on JSON responses) is
 * fine; a stale cache would be a worse failure mode than a fresh
 * round-trip.
 */
final class AssetLinksController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $packageNameRaw = Config::get('twa.package_name', '');
        $packageName = \is_string($packageNameRaw) ? $packageNameRaw : '';

        $fingerprintsRaw = Config::get('twa.sha256_fingerprints', []);
        /** @var list<string> $fingerprints */
        $fingerprints = \is_array($fingerprintsRaw)
            ? array_values(array_filter($fingerprintsRaw, 'is_string'))
            : [];

        // No fingerprints OR no package → return an empty array. The
        // route still answers 200 with valid JSON, just with no claim.
        // Chrome then renders the TWA with the URL bar visible — same
        // as if `assetlinks.json` were missing entirely, but at least
        // the endpoint is in place for the day the fingerprints land.
        if ($packageName === '' || $fingerprints === []) {
            return response()->json([]);
        }

        return response()->json([
            [
                'relation' => ['delegate_permission/common.handle_all_urls'],
                'target' => [
                    'namespace' => 'android_app',
                    'package_name' => $packageName,
                    'sha256_cert_fingerprints' => $fingerprints,
                ],
            ],
        ]);
    }
}
