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
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
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
  imports: [ButtonModule, DatePipe, ProgressSpinnerModule, TooltipModule, TranslatePipe],
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

  ngOnInit(): void {
    this.permission.set(this.webPushService.currentPermission());
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
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
      this.permission.set(this.webPushService.currentPermission());
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('profile.browserNotifications.enabledToast.summary'),
        life: 2500,
      });
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
