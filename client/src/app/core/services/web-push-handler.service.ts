import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { MessageService } from 'primeng/api';

/**
 * Subscribes the SPA to Angular's `SwPush` event streams so a delivered
 * web push (#702):
 *
 *  - **Click on the OS notification** (`notificationClicks`) →
 *    `router.navigateByUrl(data.link)` so the user lands on the post
 *    they came from. The service worker focuses an existing Budojo
 *    tab if one is open; otherwise the click opens a fresh one and
 *    THIS subscription handles the post-bootstrap navigation.
 *
 *  - **Foreground push** (`messages`) → push arrived while a Budojo
 *    tab is in the foreground; the OS doesn't pop a system
 *    notification (browser convention to avoid double notice). We
 *    surface an in-app PrimeNG toast linking to the same place
 *    instead, so the user still sees the signal.
 *
 * The service is initialised by the dashboard shell (only authenticated
 * users opted in to push subscriptions could ever receive a message);
 * `takeUntilDestroyed(destroyRef)` ties the lifecycle to the shell so
 * logging out unwires both subscriptions.
 */
interface WebPushNotificationData {
  readonly link?: string;
  readonly kind?: string;
}

interface WebPushMessage {
  readonly notification?: {
    readonly title?: string;
    readonly body?: string;
    readonly data?: WebPushNotificationData;
  };
}

@Injectable({ providedIn: 'root' })
export class WebPushHandlerService {
  private readonly swPush = inject(SwPush);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  /**
   * Wire the two `SwPush` event streams. Safe to call when the SW is
   * disabled (`SwPush.isEnabled === false`, i.e. `ng serve` dev mode)
   * — the underlying observables stay silent and the method is a
   * no-op without throwing.
   */
  initialize(destroyRef: DestroyRef): void {
    if (!this.swPush.isEnabled) {
      return;
    }

    this.swPush.notificationClicks
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(({ notification }) => {
        const link = (notification as { data?: WebPushNotificationData })?.data?.link;
        if (typeof link === 'string' && link.length > 0) {
          this.router.navigateByUrl(link);
        }
      });

    this.swPush.messages.pipe(takeUntilDestroyed(destroyRef)).subscribe((rawMessage) => {
      const message = rawMessage as WebPushMessage;
      const title = message.notification?.title;
      const body = message.notification?.body;
      if (typeof title !== 'string' || title.length === 0) {
        return;
      }
      // Suppress the foreground toast on the diagnostic ping (#819) —
      // the user just tapped "Send test notification" on the profile
      // page, they're already looking at the screen; the toast would
      // double up with the OS banner (the very thing they're verifying).
      // The OS banner still fires from the SW's push event.
      if (message.notification?.data?.kind === 'verification') {
        return;
      }
      this.messageService.add({
        // Route to the dedicated <p-toast key="push"> (PushToastComponent,
        // #1063): an on-brand template that's clickable (deep-links via
        // data.link) and dismissable — not the generic app-wide toast.
        key: 'push',
        severity: 'info',
        summary: title,
        detail: typeof body === 'string' && body.length > 0 ? body : undefined,
        life: 6000,
        // data.link is read by the toast template's click handler to
        // deep-link the user to the post/screen the push came from.
        data: message.notification?.data,
      });
    });
  }
}
