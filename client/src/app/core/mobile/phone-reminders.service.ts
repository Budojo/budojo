import { HttpClient, HttpContext } from '@angular/common/http';
import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE_REDIRECT } from '../http/skip-offline-redirect';
import { SyncService } from '../sync/sync.service';
import { NotificationPermission } from './local-notifications';
import { DueReminder, planReminders, REMINDER_CHANNEL, Told, ToldLedger } from './phone-reminders';
import { LOCAL_NOTIFICATIONS } from './shell-plugins';

/** The keys already told, kept by the page across launches (`planReminders`). */
export interface ReminderLedger {
  read(): ToldLedger;
  write(told: ToldLedger): void;
}

const LEDGER_KEY = 'budojo.reminders.told';

export const REMINDER_LEDGER = new InjectionToken<ReminderLedger>('REMINDER_LEDGER', {
  providedIn: 'root',
  factory: () => ({
    read: () => {
      try {
        const told: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}');
        return isLedger(told) ? told : {};
      } catch {
        return {};
      }
    },
    write: (told) => {
      try {
        localStorage.setItem(LEDGER_KEY, JSON.stringify(told));
      } catch {
        // Storage refused: a reminder already shown may be shown once more.
      }
    },
  }),
});

function isLedger(value: unknown): value is ToldLedger {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Told).shown === 'boolean' &&
        typeof (entry as Told).seen === 'number',
    )
  );
}

/**
 * The owner's reminders as Android notifications (#2047, PRD § 6.3). Nothing
 * runs on a phone with the app closed, so at every opening, every return to
 * the screen and every sync this asks the phone's server for the reminders of
 * the next fourteen days and hands them to Android, which shows each at its
 * hour. A no-op anywhere but inside the Android app.
 */
@Injectable({ providedIn: 'root' })
export class PhoneRemindersService {
  private readonly plugin = inject(LOCAL_NOTIFICATIONS);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly ledger = inject(REMINDER_LEDGER);
  private readonly sync = inject(SyncService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private running: Promise<void> | null = null;
  private again = false;

  /** Android's answer; null off the phone, or until it has answered. */
  readonly permission = signal<NotificationPermission | null>(null);

  constructor() {
    if (this.plugin === null) {
      return;
    }
    // A sync may bring in a fee paid on the PC, and a pull reloads the page,
    // which starts again on its own.
    effect(() => {
      if (this.sync.state().kind === 'synced') {
        untracked(() => void this.refresh());
      }
    });
  }

  /** Once the owner is in (the dashboard). */
  async start(): Promise<void> {
    if (this.plugin === null || this.started) {
      return;
    }
    this.started = true;
    const inFront = (): void => {
      if (document.visibilityState === 'visible') {
        void this.refresh();
      }
    };
    document.addEventListener('visibilitychange', inFront);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', inFront));
    try {
      await this.plugin.addListener('localNotificationActionPerformed', ({ notification }) => {
        const link = notification.extra?.link;
        if (typeof link === 'string' && link.startsWith('/')) {
          void this.router.navigateByUrl(link);
        }
      });
    } catch {
      return;
    }
    await this.refresh();
  }

  /** The owner said yes on Oggi: Android asks (Android 13+). */
  async ask(): Promise<void> {
    if (this.plugin === null) {
      return;
    }
    try {
      this.permission.set((await this.plugin.requestPermissions()).display);
    } catch {
      return;
    }
    await this.refresh();
  }

  /** One at a time: a refresh asked for during another runs once it is over. */
  refresh(): Promise<void> {
    if (!this.started) {
      return Promise.resolve();
    }
    if (this.running !== null) {
      this.again = true;
      return this.running;
    }
    this.running = this.round().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.refresh();
      }
    });
    return this.running;
  }

  private async round(): Promise<void> {
    const plugin = this.plugin;
    if (plugin === null) {
      return;
    }
    try {
      // Asked every time: the owner may have turned notifications on, or
      // off, in Android's settings since, and come back.
      this.permission.set((await plugin.checkPermissions()).display);
      if (this.permission() !== 'granted') {
        return;
      }
      await plugin.createChannel({
        id: REMINDER_CHANNEL,
        name: this.translate.instant('reminders.channel.name'),
        description: this.translate.instant('reminders.channel.description'),
        importance: 3,
        visibility: 1,
      });
      const due = await firstValueFrom(
        this.http.get<{ data: DueReminder[] }>(`${environment.apiBase}/api/v1/reminders/upcoming`, {
          // A refresh nobody asked for: a server not up yet is no reason to leave the page.
          context: new HttpContext().set(SKIP_OFFLINE_REDIRECT, true),
        }),
      );
      const kept = await plugin.getPending();
      const tray = await plugin.getDeliveredNotifications();
      const plan = planReminders(
        due.data,
        kept.notifications,
        tray.notifications.map((n) => n.id),
        this.ledger.read(),
        Date.now(),
      );
      if (plan.cancel.length > 0) {
        await plugin.cancel({ notifications: plan.cancel.map((id) => ({ id })) });
      }
      if (plan.schedule.length > 0) {
        // Cancelled first and told only once Android has them: a schedule
        // that fails leaves these keys untold, and the next refresh tries again.
        const told = { ...plan.told };
        for (const notification of plan.schedule) {
          delete told[notification.extra?.key ?? ''];
        }
        this.ledger.write(told);
        await plugin.schedule({ notifications: plan.schedule });
      }
      this.ledger.write(plan.told);
    } catch {
      // The server still starting, or Android refusing: the next opening or sync tries again.
    }
  }
}
