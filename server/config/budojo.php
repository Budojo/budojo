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

];
