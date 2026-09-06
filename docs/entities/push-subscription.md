# Entity — `PushSubscription`

## Purpose

A `PushSubscription` row records one device the user has explicitly granted browser-push permission on (#419). The SPA calls `PushManager.subscribe()`, which hands back a `PushSubscription` JSON envelope, and POSTs it here. The server-side fan-out uses `minishlink/web-push` to deliver pushes to every row tied to a target user.

The table is the BACKEND half of Web Push. The SPA toggle that triggers `PushManager.subscribe()` and the fan-out integration with the existing reminder Actions (medical-cert expiry digest, unpaid-athletes monthly digest) ship as focused follow-ups; today (v2.6.0) the table waits.

## Schema — `push_subscriptions`

Mirrors the W3C Push API `PushSubscription` serialisation so `minishlink/web-push` can reconstruct the auth key at delivery time.

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `user_id` | bigint unsigned | FK `users.id`, **cascade on delete**, indexed | Subscription owner. Cascade-on-delete ties subscriptions to account lifecycle (account-deletion drops every subscription). |
| `endpoint` | string(1024) | not null | Vendor push-service URL (FCM / Mozilla autopush / Apple Push). Up to ~1KB in practice; varchar 1024 leaves headroom for legacy Firefox URLs. |
| `endpoint_hash` | string(64) | not null | SHA-256 hex of `endpoint`. Backs the unique index — see Indexes below. |
| `p256dh` | string(255) | not null | Base64url-encoded P-256 ECDH public key (~88 chars after encoding). Required by the Web Push protocol to encrypt the payload. |
| `auth` | string(64) | not null | Base64url-encoded auth secret (~22 chars). Second half of the per-subscription key material. |
| `last_seen_at` | timestamp | nullable | Bumped on every successful delivery so a future cleanup cron can purge zombie subscriptions (uninstalled SPA, revoked permission). |
| `created_at` | timestamp | not null | |
| `updated_at` | timestamp | not null | |

## Relations

- `belongsTo(User::class)` — every subscription is owned by a single user. Cascade-on-delete: removing a user wipes their subscriptions.

## Indexes

- `PRIMARY KEY(id)`
- `INDEX(user_id)` — fast lookup of all subscriptions for a given user (fan-out hot path).
- `UNIQUE(user_id, endpoint_hash)` — one subscription per (user, endpoint) pair. The endpoint string is the unique device identifier the push service hands out; the same browser re-subscribing reuses the URL. `UNIQUE` on the FULL `endpoint` column would push the composite-index size over MySQL's 3072-byte InnoDB row-key limit (endpoint can exceed 1000 bytes), so we hash to a 64-char SHA-256 hex string and unique on `(user_id, endpoint_hash)`.

## Business rules

- **HTTPS endpoints only** — the store endpoint enforces `https://` on the `endpoint` URL. Accepting arbitrary http/internal/loopback URLs would shape-shift into an SSRF vector once the server-side fan-out POSTs back with a VAPID-signed JWT.
- **Base64url-charset enforcement** — `keys.p256dh` and `keys.auth` are validated against `[A-Za-z0-9_-]+`. Anything outside that charset is rejected, so garbage rows can't slip in and fail later at signing time.
- **Idempotent upsert** — `POST /me/push-subscriptions` with an already-subscribed endpoint hits the same `(user_id, endpoint_hash)` pair and refreshes the keys. Re-subscribing the same browser is a no-op on row count, not a duplicate.
- **Server-side VAPID configuration gate** — `meta.enabled` (returned by the index endpoint) and the `store` controller's 503 fallback both check that VAPID public key + private key + subject are ALL configured in the server env. Web Push is opt-in at the deployment level — dev / preview deployments can run without provisioning a VAPID key pair.
- **Revoke is per-row + 404-on-cross-user** — `DELETE /me/push-subscriptions/{id}` on another user's id returns 404 with the same shape as a never-existed id, so a probe can't enumerate other users' subscription IDs by status code.
- **Deliveries use `aes128gcm` and the RFC 8292 VAPID form** — `WebPushChannel` names the content encoding explicitly, because `minishlink/web-push` still defaults to `aesgcm` (draft-04 of Web Push Encryption, deprecated for years). That one value carries two standards: it selects the body encryption of **RFC 8291**, and it is passed to `VAPID::getVapidHeaders()`, which branches on it to emit `Authorization: vapid t=…, k=…` (**RFC 8292**) instead of draft-01's `WebPush <jwt>` plus a separate `Crypto-Key` header. It is also the only scheme Apple Web Push accepts, so it is what keeps Safari from being a migration. **The stored rows are unaffected** — `p256dh` and `auth` are the browser's own keys and mean the same thing under both schemes, so a subscription created before the change keeps receiving without re-subscribing (#1391).

## Related endpoints

- `GET /api/v1/me/push-subscriptions` — list the user's subscriptions + VAPID public key for the SPA (#419)
- `POST /api/v1/me/push-subscriptions` — store-or-upsert a subscription envelope (#419)
- `DELETE /api/v1/me/push-subscriptions/{id}` — revoke one subscription (#419)

## Related tables

- `users` — see [`user.md`](./user.md). FK cascade tie.
- `notifications` — see [`notification.md`](./notification.md) (the in-app inbox sibling channel; both surfaces are populated by the same Notification classes via different `via()` channels).
