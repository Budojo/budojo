<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        // `serve` is deliberately OFF here, and that is a fix rather than a
        // default (#1302). Laravel's skeleton ships `'serve' => true` on this
        // disk, and because it has no `url` the framework falls back to
        // registering it at `/storage/{path}` — the private disk squatting on
        // the public disk's URL space. Nothing ever used that route: private
        // documents are downloaded through the authenticated
        // DocumentController, and no code builds a signed storage URL.
        //
        // It was never a data leak — ServeFile demands a valid signature for
        // any disk whose visibility is not `public`, so unsigned callers got
        // 403 (dev) / 404 (production) — but it shadowed the public disk's
        // route and left every avatar, academy logo and video thumbnail
        // unreachable wherever the `public/storage` symlink was missing.
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'throw' => false,
            'report' => false,
        ],

        // `serve` makes the framework register `/storage/{path}` for THIS
        // disk. Normally redundant — nginx (`try_files $uri $uri/
        // /index.php`) and PHP's built-in server both serve the real file
        // through the `public/storage` symlink before reaching the router.
        //
        // It registers TWO routes, not one: a GET (`storage.public`) and a
        // **PUT** (`storage.public.upload`) that writes the request body
        // straight onto this disk. The PUT is gated harder than the GET —
        // ReceiveFile requires `?upload=1` AND a valid relative signature,
        // with no `visibility: public` bypass, so it needs the APP_KEY and
        // nothing in this app ever mints such a URL. `PublicStorageTest`
        // pins that. Worth knowing it exists before enabling `serve`
        // anywhere else.
        //
        // Cost, so nobody assumes the route is free: ServeFile hard-codes
        // `Cache-Control: no-store`, so wherever this route is the only path
        // — the packaged desktop app — every avatar and logo is re-streamed
        // through PHP on each render instead of being a cacheable static
        // file. Fine at single-user desktop scale; if it ever bites,
        // `Storage::disk('public')->serveUsing(...)` sets your own headers.
        //
        // The packaged desktop app is where it matters: the install directory
        // is read-only by design, `storage/` is relocated to the per-user data
        // directory (#1223), and a Windows symlink needs Developer Mode or
        // elevation — so the link cannot exist and the route is the only way
        // these files are reachable. `visibility: public` is what lets
        // ServeFile answer without a signed URL, which an `<img src>` could
        // never provide.
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
