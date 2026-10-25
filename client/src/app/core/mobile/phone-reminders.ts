import { LocalNotification, PendingNotification } from './local-notifications';

/** One reminder of the next days, as `GET /reminders/upcoming` answers it (#2047). */
export interface DueReminder {
  /** The occurrence it names (`unpaid:2026-05`): one notification per key. */
  key: string;
  /** ISO 8601, with the operator's offset. */
  at: string;
  title: string;
  body: string;
  /** Where a tap on it leads, inside the app. */
  link: string;
}

/** What to tell Android, and the keys told so far, which the next refresh reads back. */
export interface ReminderPlan {
  cancel: number[];
  schedule: LocalNotification[];
  handed: string[];
}

/** The channel every reminder is posted to: public, so the whole text shows on the lock screen. */
export const REMINDER_CHANNEL = 'reminders';

/**
 * The diff between the reminders handed to Android (`kept`, what the plugin
 * keeps of them) and the reminders due (#2047, PRD § 6.3). Each key is told
 * once:
 * - one still to come is left alone while its words and time stay the same,
 *   replaced when they change, and cancelled once it is no longer due: the
 *   fee got paid on the PC;
 * - one already shown is never taken back, nor shown again: not when it was
 *   swiped away (only `handed` remembers it then), nor when the next day dates
 *   the same missed streak to its own morning;
 * - one due before now that Android never had is shown at once. That is a
 *   phone opened late, or a certificate added after its reminder's hour, which
 *   the PC would also tell on its next round.
 *
 * `handed` keeps only the keys still due: a key names its own day, so the
 * ledger forgets each one when its day leaves the window.
 */
export function planReminders(
  due: readonly DueReminder[],
  kept: readonly PendingNotification[],
  handed: readonly string[],
  now: number,
): ReminderPlan {
  const ours = new Map<string, { id: number; at: number; fingerprint: string | undefined }>();
  for (const notification of kept) {
    const extra = notification.extra;
    if (typeof extra?.key === 'string' && typeof extra.at === 'number') {
      ours.set(extra.key, { id: notification.id, at: extra.at, fingerprint: extra.fingerprint });
    }
  }
  const told = new Set(handed);
  const dueKeys = new Set(due.map((reminder) => reminder.key));
  const plan: ReminderPlan = { cancel: [], schedule: [], handed: [] };

  for (const [key, notification] of ours) {
    if (notification.at > now && !dueKeys.has(key)) {
      plan.cancel.push(notification.id);
    }
  }

  for (const reminder of due) {
    const at = Date.parse(reminder.at);
    const fingerprint = fingerprintOf(reminder, at);
    const scheduled = ours.get(reminder.key);
    if (scheduled !== undefined && scheduled.at > now) {
      if (scheduled.fingerprint !== fingerprint) {
        plan.cancel.push(scheduled.id);
        plan.schedule.push(notificationOf(reminder, at, fingerprint, now));
      }
    } else if (scheduled === undefined && !told.has(reminder.key)) {
      plan.schedule.push(notificationOf(reminder, at, fingerprint, now));
    }
    plan.handed.push(reminder.key);
  }

  return plan;
}

/**
 * The notification's id, from its key: the same key, the same id, so a
 * reminder can be found and replaced. A positive Java int (FNV-1a, 31 bits).
 * Two keys could share one, and the second would replace the first; with
 * the few dozen keys of fourteen days, that is a chance in tens of millions.
 */
export function reminderId(key: string): number {
  return fnv1a(key) >>> 1;
}

function notificationOf(
  reminder: DueReminder,
  at: number,
  fingerprint: string,
  now: number,
): LocalNotification {
  return {
    id: reminderId(reminder.key),
    title: reminder.title,
    body: reminder.body,
    largeBody: reminder.body,
    channelId: REMINDER_CHANNEL,
    autoCancel: true,
    isExactNotification: false,
    // Past its time, it is shown at once; ahead of it, Android may wake the
    // phone for it, a little after the hour rather than exactly on it.
    ...(at > now ? { schedule: { at: new Date(at), allowWhileIdle: true } } : {}),
    extra: { key: reminder.key, at, fingerprint, link: reminder.link },
  };
}

function fingerprintOf(reminder: DueReminder, at: number): string {
  return fnv1a([at, reminder.title, reminder.body, reminder.link].join('\n')).toString(36);
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
