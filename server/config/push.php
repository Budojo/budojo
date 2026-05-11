<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Web Push VAPID keys (#419)
    |--------------------------------------------------------------------------
    |
    | Voluntary Application Server Identification keys for Web Push. The
    | SPA reads `public_key` to call `PushManager.subscribe()`; the
    | server-side fanout uses both keys to sign push payloads sent to
    | the vendor push service (FCM / Mozilla autopush / Apple Push).
    |
    | Generate a key pair once per environment:
    |   vendor/bin/web-push generate-vapid
    | Then set:
    |   VAPID_PUBLIC_KEY=...
    |   VAPID_PRIVATE_KEY=...
    |   VAPID_SUBJECT=mailto:ops@yourdomain
    |
    | The subject is an RFC 7519 `sub` claim — a `mailto:` URL or an
    | `https://` URL the push service can use to reach you on abuse.
    | Required by Firefox + Chrome.
    |
    | When the keys are unset the controller refuses to create
    | subscriptions (returns 503) — Web Push is opt-in at the
    | environment level so dev / preview deployments can run without
    | setting up the key pair.
    */
    'vapid' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:ops@budojo.local'),
    ],
];
