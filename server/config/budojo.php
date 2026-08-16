<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Runtime profile (#1220)
    |--------------------------------------------------------------------------
    |
    | Either "web" (the hosted SPA + API) or "desktop" (one process on one
    | machine inside the Electron shell — see M11, #1218). Read it through
    | `App\Support\Runtime`, never with a bare `env()` call: env() returns null
    | once the config is cached, and the fallback rules live in one place.
    |
    | An unrecognised value resolves to "web", the conservative default.
    |
    */

    'runtime' => env('BUDOJO_RUNTIME', 'web'),

    /*
    |--------------------------------------------------------------------------
    | Desktop driver profile
    |--------------------------------------------------------------------------
    |
    | The drivers a desktop instance MUST run with, and why each one differs
    | from the hosted stack:
    |
    |   queue   => sync    There is no worker process. On "database" a queued
    |                      job is written and never picked up, so a medical
    |                      certificate reminder is silently never delivered —
    |                      the single failure mode with real consequences.
    |   cache   => file    No Redis, no shared DB. Keeping cache off the
    |                      SQLite file also keeps the write lock free for
    |                      actual user data.
    |   session => file    Same reasoning; the API is token-authenticated, so
    |                      sessions barely matter, but they must not contend
    |                      for the database lock.
    |
    | `DesktopDriverGuard` enforces these at boot rather than letting a
    | mismatch fail quietly hours later.
    |
    */

    'desktop_drivers' => [
        'queue.default' => 'sync',
        'cache.default' => 'file',
        'session.driver' => 'file',
    ],

    /*
    |--------------------------------------------------------------------------
    | Capabilities per runtime profile (#1229)
    |--------------------------------------------------------------------------
    |
    | What each profile is able to offer — see AppEnumsCapability. The
    | desktop is one process on one machine with no mail transport and no
    | browser push service, so everything that assumes a second human, an
    | inbox or a push endpoint is absent there. The code behind each stays in
    | place and tested; flipping the profile restores it.
    |
    | Routes are gated with the `capability:<name>` middleware (404, never 403).
    | Read through AppSupportCapabilities, never from this array directly.
    |
    */

    'capabilities' => [
        'web' => [
            'community',
            'athlete_accounts',
            'web_push',
            'email',
            'password_breach_check',
        ],
        'desktop' => [
            'licensing',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Licensing (#1290)
    |--------------------------------------------------------------------------
    |
    | Budojo Desktop runs on the owner's machine with no server of ours to call,
    | so activation is offline: a key carries its own claims and an Ed25519
    | signature, and the app carries only the public half — which cannot mint
    | anything. Generate the pair with:
    |
    |   node .claude/scripts/license-key.mjs keygen
    |
    | The public half (base64url, exactly as printed) belongs here; the private
    | half belongs in a password manager and nowhere else.
    |
    | Left empty, the build cannot verify anything and therefore enforces
    | nothing — see GetLicenseStateAction for why that direction is the safe
    | one to fail in.
    |
    */

    'license' => [

        'public_key' => env('BUDOJO_LICENSE_PUBLIC_KEY', ''),

        /*
        | What stays writable when the licence has lapsed. Everything else is
        | refused with 402 by `EnforceLicense`, which is applied to the whole
        | API group — so a route added later is covered by default and this list
        | is the record of every deliberate exception.
        |
        | Each entry earns its place:
        */
        'exempt' => [
            // Sign in, sign out, register, reset a password. You cannot paste
            // an activation key from a login screen you are locked out of.
            'api/v1/auth/*',

            // Activation itself — the way out of the blocked state.
            'api/v1/license',

            // Security hygiene is never held hostage to a billing state.
            'api/v1/me/password',
            'api/v1/me/sessions',
            'api/v1/me/sessions/*',
            'api/v1/me/two-factor',
            'api/v1/me/two-factor/*',

            // The right to erasure is not a paid feature.
            'api/v1/me/deletion-request',
            'api/v1/me/deletion-request/*',

            // Reaching a human when you are stuck, and dismissing the
            // notification that told you that you are.
            'api/v1/support',
            'api/v1/me/notifications/*',
        ],

    ],

];
