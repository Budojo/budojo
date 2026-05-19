<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * User-triggered test push (#819). Fires when a user taps "Send test
 * notification" under the Browser notifications card on
 * `/dashboard/me/profile`. Lets the user self-verify that their device's
 * push channel is healthy at any time (after a phone reboot, after an
 * Android Chrome auto-revoke of notification permissions, after a TWA
 * update, …) — and gives us a one-tap diagnostic affordance when the
 * next user reports "push doesn't work".
 *
 * **Channels intentionally LIMITED to `WebPushChannel`** — no `database`
 * fan-out. The test push is a transient health check; logging it in
 * the bell inbox would create user-visible noise (a row reading "Test
 * notification" every time someone smoke-tests).
 *
 * Quiet hours still apply (inherited from `WebPushChannel`). If a user
 * inside their muted window taps Test, no banner appears — which is
 * consistent with the channel's contract and the right signal: "your
 * quiet hours are active right now".
 */
class TestPushNotification extends Notification
{
    use Queueable;

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    /**
     * @return array<string, mixed>
     */
    public function toWebPush(object $notifiable): array
    {
        return [
            'title' => 'Test notification',
            'body' => 'If you see this banner, push is working on this device.',
            // `data.kind: 'verification'` lets the SPA's `SwPush.messages`
            // handler (`web-push-handler.service.ts`) recognise this as
            // a test ping and suppress the in-app toast — the user is
            // already looking at the profile page, no need to double
            // up with a foreground toast.
            'kind' => 'verification',
        ];
    }
}
