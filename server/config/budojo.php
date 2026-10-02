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
    | The operator's timezone (#1963)
    |--------------------------------------------------------------------------
    |
    | Where the owner lives, and so which calendar day "today" is for them.
    | Storage stays UTC (`app.timezone`); this only decides the day. Read it
    | through `App\Support\OperatorDay`, never as a literal: a second copy of
    | it is how "today" was UTC's for every date rule while the scheduler ran
    | in Rome. One key for the install, not one per academy — a single owner
    | on one desktop — until a second timezone is a real need.
    |
    */

    'operator_timezone' => 'Europe/Rome',

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
            'document_upload',
        ],
        'desktop' => [
            'document_upload',
            'sync',
        ],
        // The phone (#2034): the desktop's set but the document upload, since
        // documents are view only there (PRD § 2).
        'mobile' => [
            'sync',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Sync between the owner's devices (#2030)
    |--------------------------------------------------------------------------
    |
    | `database` is the SQLite file a version is exported from and staged
    | beside. Unset, it is the default connection's. The tests point it at a
    | file of their own: their connection is in memory and inside a
    | transaction, where `VACUUM INTO` cannot run.
    |
    */
    'sync' => [
        'database' => env('BUDOJO_SYNC_DATABASE'),
        // This device's id in the sync folder (#2031), given by the shell,
        // which keeps it with the sync key: never the database, which
        // travels between devices. Unset until the device is paired, and
        // until then nothing is journaled.
        'device' => env('BUDOJO_DEVICE_ID'),
        // Where the academy's files are (`storage/app`), and a restore stages
        // its own beside them (#2079). Unset, Laravel's; the tests point it at
        // a folder of their own.
        'storage' => env('BUDOJO_SYNC_STORAGE'),
    ],

    /*
    |--------------------------------------------------------------------------
    | The shell (#2079)
    |--------------------------------------------------------------------------
    |
    | A secret the desktop's and the phone's shell make at each launch and
    | hand to their own page alone. It lets that page, and nothing else on
    | `127.0.0.1`, open the owner's session and replace the academy
    | (`RequireShell`). Unset, as on the web, nothing passes.
    |
    */
    'shell' => [
        'secret' => env('BUDOJO_SHELL_SECRET'),
    ],

];
