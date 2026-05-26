import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDestructiveButtonComponent } from '../../../shared/components/confirm-destructive-button/confirm-destructive-button.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PushDevice,
  PushStateMeta,
  WebPushError,
  WebPushService,
} from '../../../core/services/web-push.service';

/**
 * "Browser notifications" panel on `/dashboard/profile` (#694).
 *
 * Closes the client half of the Web Push pipeline shipped in #419: the
 * server already exposes `GET/POST/DELETE /me/push-subscriptions`, but
 * no SPA surface ever called `PushManager.subscribe()`. This panel does.
 *
 * The displayed `state` collapses four orthogonal concerns into one
 * token so the template can `@switch` over it without nesting `@if`s
 * five deep:
 *
 *   - 'unsupported'        — browser is missing serviceWorker or PushManager
 *   - 'server-disabled'    — backend has no VAPID config (dev / preview)
 *   - 'permission-denied'  — user clicked Block on the OS-level prompt
 *   - 'off'                — capable + permitted but not subscribed on this device
 *   - 'on'                 — at least one device subscribed
 *
 * The "permission-denied" branch is informational only — the SPA can't
 * undo a denial. We tell the user where to flip the toggle (browser
 * site settings).
 */
type PanelState = 'unsupported' | 'server-disabled' | 'permission-denied' | 'off' | 'on';

@Component({
  selector: 'app-profile-browser-notifications',
  standalone: true,
  imports: [
    ButtonModule,
    ConfirmPopup,
    ConfirmDestructiveButtonComponent,
    DatePipe,
    ProgressSpinnerModule,
    TooltipModule,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-browser-notifications.component.html',
  styleUrl: './profile-browser-notifications.component.scss',
})
export class ProfileBrowserNotificationsComponent implements OnInit {
  private readonly webPushService = inject(WebPushService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly busy = signal<boolean>(false);
  protected readonly devices = signal<readonly PushDevice[]>([]);
  protected readonly meta = signal<PushStateMeta>({ vapid_public_key: null, enabled: false });
  protected readonly permission = signal<NotificationPermission>('default');

  /**
   * SHA-256 hash of the CURRENT browser's PushSubscription endpoint
   * (#822). Read once on init; the value is stable across the
   * component's lifetime because the local subscription's endpoint
   * doesn't change without an explicit subscribe/unsubscribe (which
   * we trigger ourselves and refresh state after).
   */
  protected readonly currentEndpointHash = signal<string | null>(null);

  protected readonly isSupported = this.webPushService.isSupported();

  /**
   * "What action can the user take?" — distinct from `hasDevices` so
   * the existing device list stays visible (and revocable) even when
   * the action surface is blocked. The five states map to one CTA
   * each; the device list renders independently whenever `devices()`
   * is non-empty.
   */
  protected readonly state = computed<PanelState>(() => {
    if (!this.isSupported) return 'unsupported';
    if (!this.meta().enabled) return 'server-disabled';
    if (this.permission() === 'denied') return 'permission-denied';
    if (this.devices().length === 0) return 'off';
    return 'on';
  });

  /** Render the device list independently of `state`. */
  protected readonly hasDevices = computed<boolean>(() => this.devices().length > 0);

  /**
   * `true` when the current browser's PushSubscription endpoint hash
   * matches one of the registered devices (#822). When true:
   *  - The matching row carries a "(this device)" pill.
   *  - The "Add another device" affordance hides (clicking it from
   *    the same browser is a no-op — the server's
   *    `updateOrCreate(user_id, endpoint_hash)` just refreshes the
   *    same row) and is replaced with instructional copy explaining
   *    that "add another device" means opening the SPA on a
   *    different device.
   */
  protected readonly currentDeviceMatched = computed<boolean>(() => {
    const hash = this.currentEndpointHash();
    if (!hash) return false;
    return this.devices().some((d) => d.endpoint_hash === hash);
  });

  /**
   * The id of the row that corresponds to the current browser, or
   * null. Used by the template to render the "(this device)" pill on
   * only that row.
   */
  protected readonly currentDeviceId = computed<number | null>(() => {
    const hash = this.currentEndpointHash();
    if (!hash) return null;
    return this.devices().find((d) => d.endpoint_hash === hash)?.id ?? null;
  });

  ngOnInit(): void {
    this.permission.set(this.webPushService.currentPermission());
    this.refresh();
    // Hash the current browser's PushSubscription endpoint (#822).
    // Fire-and-forget — the signal is null until the promise resolves
    // (~10 ms in practice). Errors are swallowed inside
    // `currentEndpointHash`; null is the documented "couldn't
    // determine" branch and the UI degrades gracefully (no pill,
    // Add-another button stays visible).
    void this.webPushService.currentEndpointHash().then((hash) => {
      this.currentEndpointHash.set(hash);
    });
  }

  /**
   * @param silent — skip the loading-flash on the panel. Used by the
   *   post-subscribe reconcile (#899): the optimistic local prepend
   *   has already painted the new row, so flipping `loading` would
   *   blank the panel under a success toast — Norman feedback
   *   violation (signalling success and uncertainty at once).
   */
  protected refresh(silent = false): void {
    if (!silent) this.loading.set(true);
    this.errored.set(false);
    this.webPushService.fetchState().subscribe({
      next: (state) => {
        this.devices.set(state.devices);
        this.meta.set(state.meta);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  protected async enable(): Promise<void> {
    if (this.busy()) return;
    const vapidKey = this.meta().vapid_public_key;
    if (!vapidKey) return;

    this.busy.set(true);
    try {
      const device = await this.webPushService.subscribe(vapidKey);
      // The backend is idempotent on (user, endpoint_hash) and a
      // re-subscribe from the same browser returns the existing row's
      // id. Filter the prior entry out before prepending so the
      // template's `@for (...; track device.id)` never sees a duplicate
      // key (which would throw at runtime under strict change-detection).
      this.devices.update((current) => [device, ...current.filter((d) => d.id !== device.id)]);
      // Reconcile against the canonical server state (#899). The local
      // signal can carry rows that `WebPushChannel::send()` already
      // auto-deleted on a vendor 410 (post-deploy endpoint rotation,
      // most commonly). Silent so the panel keeps showing the freshly-
      // added row while the GET completes — Norman feedback rule
      // (#900 review).
      this.refresh(/* silent */ true);
      this.permission.set(this.webPushService.currentPermission());
      // Re-fetch the current browser's endpoint hash (#822 reviewer
      // follow-up). On a fresh page where the user starts in state
      // 'off', the init-time fetch returned null (no subscription
      // existed). Now that `subscribe()` succeeded, a real
      // PushSubscription exists; re-resolve so the just-added device
      // row picks up the "(this device)" pill and the Add-another
      // button hides immediately, no refresh required.
      void this.webPushService.currentEndpointHash().then((hash) => {
        this.currentEndpointHash.set(hash);
      });
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('profile.browserNotifications.enabledToast.summary'),
        life: 2500,
      });
      // Background verification (#818) — fire a test push + race the SW
      // for 5s. If the SW never sees the push, the channel is muted at
      // the OS level (Chrome notif off, battery saver) and we surface
      // a SECOND toast with the actionable hint. Fire-and-forget; the
      // success toast above already confirms the SPA-side state.
      void this.verifyAfterEnable();
    } catch (error: unknown) {
      // Recompute permission so the panel flips to 'permission-denied'
      // immediately if the user clicked Block on the OS prompt.
      this.permission.set(this.webPushService.currentPermission());
      const reason = error instanceof WebPushError ? error.reason : ('subscribe_failed' as const);
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant(`profile.browserNotifications.errors.${reason}.summary`),
        detail: this.translate.instant(`profile.browserNotifications.errors.${reason}.detail`),
        life: 5000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Post-subscribe delivery verification (#818). Runs in the
   * background after `enable()` shows the success toast. Outcomes:
   *  - 'ok'      — channel works end-to-end, no extra UI.
   *  - 'unknown' — couldn't verify (SW disabled / test endpoint
   *                errored). No extra UI to avoid false alarms.
   *  - 'silent'  — push delivered to FCM but the SW never received
   *                it; most likely OS-level mute. Surface a warn
   *                toast pointing at OS settings.
   */
  private async verifyAfterEnable(): Promise<void> {
    const result = await this.webPushService.verifyDelivery();
    if (result === 'silent') {
      this.messageService.add({
        severity: 'warn',
        summary: this.translate.instant('profile.browserNotifications.verifySilentToast.summary'),
        detail: this.translate.instant('profile.browserNotifications.verifySilentToast.detail'),
        life: 8000,
      });
    }
  }

  /**
   * Fire a server-side diagnostic push (#819). Lets the user verify
   * their device's push channel is delivering OS-level notifications
   * — useful after a phone reboot, after Android revokes Chrome's
   * permission, or just as a smoke test. The bell badge stays clean
   * because `TestPushNotification.via()` excludes the database channel.
   */
  protected async sendTest(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.webPushService.sendTest();
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('profile.browserNotifications.sendTestToast.summary'),
        detail: this.translate.instant('profile.browserNotifications.sendTestToast.detail'),
        life: 4000,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.browserNotifications.sendTestErrorToast.summary'),
        detail: this.translate.instant('profile.browserNotifications.sendTestErrorToast.detail'),
        life: 5000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(device: PushDevice): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.webPushService.unsubscribe(device.id);
      // If the revoked row IS this browser, also drop the local
      // PushSubscription (#1065). Without this, the app-load reconcile
      // would see a live local subscription absent from the server list
      // and silently re-register it — resurrecting the device the user
      // just revoked. Possible now that endpoint_hash (#822) lets us
      // identify "this device". Other devices' local subs are untouched.
      if (device.id === this.currentDeviceId()) {
        await this.webPushService.unsubscribeLocal();
        this.currentEndpointHash.set(null);
      }
      this.devices.update((current) => current.filter((d) => d.id !== device.id));
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('profile.browserNotifications.revokedToast.summary'),
        life: 2500,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.browserNotifications.revokeErrorToast.summary'),
        detail: this.translate.instant('profile.browserNotifications.revokeErrorToast.detail'),
        life: 5000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
