<?php

declare(strict_types=1);

namespace App\Notifications\Channels;

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
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
 * `Channel::extend()` registration. `WebPush` itself is bound as a
 * singleton in `AppServiceProvider` with the VAPID keys from config.
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

        $subscriptions = $notifiable->pushSubscriptions;
        if ($subscriptions->isEmpty()) {
            return;
        }

        /** @var array<string, mixed> $payload */
        $payload = $notification->toWebPush($notifiable);
        $payloadJson = json_encode($payload, JSON_THROW_ON_ERROR);

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
}
