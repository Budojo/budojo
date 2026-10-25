/**
 * Android's own notifications (#2047, PRD § 6.3): the part of
 * `@capacitor/local-notifications` the reminders use. The plugin lives in the
 * Android app (mobile/package.json), reached through Capacitor's global as
 * the shell's own plugins are, so the client keeps no dependency only the
 * phone needs.
 */

/** Android's answer about notifications; `prompt` until the owner is asked (Android 13+). */
export type NotificationPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

/** What the reminders keep on each notification, to know it again at the next refresh. */
export interface ReminderExtra {
  key: string;
  /** When it is due, in milliseconds: the plugin answers its own schedule in no format to rely on. */
  at: number;
  /** Changes when the words or the time change, so a stale one is replaced. */
  fingerprint: string;
  link: string;
}

export interface LocalNotification {
  id: number;
  title: string;
  body: string;
  /** The whole text when the notification is opened out: a digest runs to several lines. */
  largeBody?: string;
  channelId?: string;
  autoCancel?: boolean;
  /** Absent: shown now. */
  schedule?: { at: Date; allowWhileIdle?: boolean };
  /** False: no exact alarm, so no prompt for one (see AndroidManifest.xml). */
  isExactNotification?: boolean;
  extra?: ReminderExtra;
}

export interface PendingNotification {
  id: number;
  extra?: Partial<ReminderExtra> | null;
}

export interface NotificationChannel {
  id: string;
  name: string;
  description?: string;
  /** 3, Android's default: a sound, and on the lock screen. */
  importance?: 1 | 2 | 3 | 4 | 5;
  /** 1, public: the whole text on the lock screen, the owner's choice (PRD § 6.3). */
  visibility?: -1 | 0 | 1;
}

export interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: NotificationPermission }>;
  requestPermissions(): Promise<{ display: NotificationPermission }>;
  createChannel(channel: NotificationChannel): Promise<void>;
  schedule(options: { notifications: LocalNotification[] }): Promise<unknown>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
  /** Every notification the plugin keeps: those still to come, and those shown and not yet swiped away. */
  getPending(): Promise<{ notifications: PendingNotification[] }>;
  addListener(
    event: 'localNotificationActionPerformed',
    listener: (action: { notification: { extra?: Partial<ReminderExtra> | null } }) => void,
  ): Promise<unknown>;
}

/** The plugin when the page runs inside the Android app; null anywhere else. */
export function localNotificationsPlugin(): LocalNotificationsPlugin | null {
  const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (
    (capacitor?.Plugins?.['LocalNotifications'] as LocalNotificationsPlugin | undefined) ?? null
  );
}
