<?php

declare(strict_types=1);

namespace App\Notifications\Channels;

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\ContentEncoding;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\Subscription as WebPushSubscription;
use Minishlink\WebPush\WebPush;

/**
 * Custom Laravel notification channel that delivers a payload to every
 * `push_subscriptions` row of a notifiable user (#696, closes the
 * fanout half of the Web Push pipeline whose client half shipped in
 * #694 / server scaffolding in #419).
 *
 * **Contract**: a notification class adds `WebPushChannel::class` to
 * its `via()` array and exposes a public `toWebPush($notifiable):
 * array` method returning the JSON payload — same shape as the
 * existing `toDatabase()` envelope. This channel takes the result,
 * JSON-encodes it, queues one push per stored subscription, flushes
 * via `minishlink/web-push`, and reconciles each row to the vendor
 * push service's response:
 *
 *   - **200/201/204** — success. Bump `last_seen_at` so a future
 *     cleanup cron knows this device is still reachable.
 *   - **404 / 410**   — endpoint gone (user revoked permission at
 *     the OS level, uninstalled the SPA, etc). Delete the row so
 *     the next fanout doesn't waste a request on a dead browser.
 *   - **anything else** — log a warning and leave the row alone.
 *     Transient 5xx errors are common and self-heal on the next
 *     fanout.
 *
 * The channel is a no-op (silent return) when:
 *   - The notification class doesn't expose `toWebPush()`.
 *   - The notifiable has no `pushSubscriptions` relation.
 *   - The notifiable has zero subscriptions.
 *   - VAPID keys aren't configured on the server (logs a warning
 *     once; the controller already gates `store()` with a 503 so
 *     this branch only fires if the keys are unset AT DELIVERY TIME
 *     after subscriptions were created — typically a misconfigured
 *     redeploy).
 *
 * Laravel's notification dispatcher auto-resolves the channel class
 * from the `via()` array via the container — no manifest, no manual
 * `Channel::extend()` registration. `WebPush` itself is registered
 * via `bind()` in `AppServiceProvider` so a fresh instance is built
 * on each container resolution (not `singleton()` — `WebPush` carries
 * per-instance queued-payload state, and sharing it across concurrent
 * notifications or across queue-worker job boundaries would let
 * payloads cross-contaminate).
 */
class WebPushChannel
{
    public function __construct(
        private readonly WebPush $webPush,
    ) {
    }

    public function send(mixed $notifiable, Notification $notification): void
    {
        // Constrain `$notifiable` to a `User` — only User-backed
        // notifications can carry a `pushSubscriptions` relation; any
        // other shape (a fresh anonymous notifiable, a custom class)
        // can't have stored subscriptions and is a no-op by definition.
        if (! $notifiable instanceof User) {
            return;
        }

        if (! method_exists($notification, 'toWebPush')) {
            return;
        }

        // Quiet hours (#729 A3): suppress push delivery when the
        // current local hour falls inside the user's configured
        // window. Inbox writes (via the database channel) still
        // happen, so the user catches up the moment the window
        // ends — only the OS-level interrupt is muted. NULL on
        // either column = quiet hours off, the default.
        if (self::insideQuietHours($notifiable)) {
            return;
        }

        // VAPID-unconfigured environments: silently no-op rather than
        // letting `minishlink/web-push` throw at sign time. The
        // controller already 503's a subscribe attempt in this state
        // (so no rows should exist), but a row could persist across a
        // misconfigured redeploy that emptied the env — log it once
        // and bail before resolving the WebPush instance.
        if (! self::vapidConfigured()) {
            Log::warning('WebPushChannel: VAPID keys are not configured; skipping delivery.');

            return;
        }

        $subscriptions = $notifiable->pushSubscriptions;
        if ($subscriptions->isEmpty()) {
            return;
        }

        /** @var array<string, mixed> $payload */
        $payload = $notification->toWebPush($notifiable);

        // Reshape into the wire envelope Angular's `SwPush` expects
        // (#702): a top-level `notification: { title, body, data }`
        // key. With this shape the browser's service worker renders
        // the OS-level notification automatically and emits to
        // `SwPush.notificationClicks` on tap; the rest of our payload
        // (link, kind, post_id, ...) rides under `data` and the SPA's
        // click handler reads `data.link` to deep-link the user. A
        // flat `{title, body, link, ...}` payload would only fire
        // `SwPush.messages` (foreground), never the OS notification.
        $title = \is_string($payload['title'] ?? null) ? $payload['title'] : 'Budojo';
        $body = \is_string($payload['body'] ?? null) ? $payload['body'] : '';
        unset($payload['title'], $payload['body']);

        $payloadJson = json_encode([
            'notification' => [
                'title' => $title,
                'body' => $body,
                'data' => $payload,
            ],
        ], JSON_THROW_ON_ERROR);

        // Build a lookup map upfront so the per-report reconciliation
        // below is O(reports) instead of O(reports × subscriptions).
        /** @var array<string, PushSubscription> $byEndpoint */
        $byEndpoint = [];
        foreach ($subscriptions as $subscription) {
            $byEndpoint[$subscription->endpoint] = $subscription;
            $this->webPush->queueNotification(
                WebPushSubscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->p256dh,
                    'authToken' => $subscription->auth,
                    // Named explicitly because the library still defaults to
                    // `aesgcm` — draft-04 of Web Push Encryption, deprecated
                    // for years — and says in its own source that the next
                    // major will flip it. Until then, omitting this is a
                    // choice, not a neutral absence (#1391).
                    //
                    // It carries further than encryption: the same value is
                    // handed to `VAPID::getVapidHeaders()`, which branches on
                    // it to pick the authorization form. So `aes128gcm` buys
                    // RFC 8291 for the body AND RFC 8292 (`vapid t=…, k=…`)
                    // for the signature, instead of draft-01's `WebPush <jwt>`
                    // plus a separate `Crypto-Key` header.
                    //
                    // It is also the only scheme Apple Web Push accepts, so
                    // this is what stops Safari being a migration later.
                    'contentEncoding' => ContentEncoding::aes128gcm,
                ]),
                $payloadJson,
            );
        }

        /** @var iterable<MessageSentReport> $reports */
        $reports = $this->webPush->flush();
        foreach ($reports as $report) {
            $endpoint = $report->getEndpoint();
            $subscription = $byEndpoint[$endpoint] ?? null;
            if ($subscription === null) {
                continue;
            }

            if ($report->isSuccess()) {
                $subscription->forceFill(['last_seen_at' => now()])->save();

                continue;
            }

            $status = $report->getResponse()?->getStatusCode();
            if (\in_array($status, [404, 410], true)) {
                $subscription->delete();

                continue;
            }

            Log::warning('WebPush delivery failed', [
                'user_id' => $subscription->user_id,
                'endpoint_host' => parse_url($endpoint, PHP_URL_HOST),
                'status' => $status,
                'reason' => $report->getReason(),
            ]);
        }
    }

    /**
     * Quiet hours window check (#729 A3). Both columns NULL = window
     * off. Both set = inclusive-start, exclusive-end window in the
     * application timezone (`config('app.timezone')` for now —
     * per-user timezone is a future enhancement for #271
     * multi-market). Supports windows crossing midnight (e.g. 22 → 8)
     * via modular arithmetic: when start > end, "inside" means
     * `hour >= start OR hour < end`.
     */
    private static function insideQuietHours(User $user): bool
    {
        $start = $user->quiet_hours_start_local;
        $end = $user->quiet_hours_end_local;
        if ($start === null || $end === null) {
            return false;
        }
        $tz = config('app.timezone');
        $hour = (int) Carbon::now(\is_string($tz) ? $tz : null)->format('G');
        if ($start === $end) {
            // Same-hour window — degenerate. Treat as off rather than
            // a 24-hour mute (which would functionally disable push
            // for the user and is almost certainly a UI input slip).
            return false;
        }
        if ($start < $end) {
            return $hour >= $start && $hour < $end;
        }

        return $hour >= $start || $hour < $end;
    }

    /**
     * Mirrors the `PushSubscriptionController` gate so the
     * "configured at subscribe time AND at delivery time" check stays
     * symmetric: all three keys non-empty strings.
     */
    private static function vapidConfigured(): bool
    {
        $pub = config('push.vapid.public_key');
        $priv = config('push.vapid.private_key');
        $sub = config('push.vapid.subject');

        return \is_string($pub) && $pub !== ''
            && \is_string($priv) && $priv !== ''
            && \is_string($sub) && $sub !== '';
    }
}
