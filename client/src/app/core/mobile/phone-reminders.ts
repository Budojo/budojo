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

/** A key handed to Android and not taken back: whether it has been shown, and when it last mattered. */
export interface Told {
  /** Seen in the tray, or its record gone while the ledger held it: swiped away, tapped, or shown at once. */
  shown: boolean;
  /** The last refresh that found it due or kept, in milliseconds. */
  seen: number;
}

/** The keys told so far, which the page keeps across launches. */
export type ToldLedger = Record<string, Told>;

/** What to tell Android, and the ledger to keep once it is told. */
export interface ReminderPlan {
  cancel: number[];
  schedule: LocalNotification[];
  told: ToldLedger;
}

/** The channel every reminder is posted to: public, so the whole text shows on the lock screen. */
export const REMINDER_CHANNEL = 'reminders';

/** A key off the list this long is forgotten: the forecast's own window. */
const FORGET_AFTER_MS = 14 * 86_400_000;

/**
 * The diff between the reminders handed to Android and the reminders due
 * (#2047, PRD § 6.3). `kept` is the plugin's records (see `getPending`):
 * one is gone once its notification is swiped away or tapped, and one shown
 * at once never had any. `delivered` is the tray, which a restart empties.
 * Each key is told once:
 * - one still to come is left alone while its words and time stay the same,
 *   replaced when they change, and cancelled once it is no longer due: the
 *   fee got paid on the PC. A cancelled one was never shown, so it is
 *   forgotten, and may come back;
 * - one shown is never taken back nor shown again, even when the next day
 *   dates the same missed streak to its own morning. Shown means in the tray,
 *   seen there by an earlier refresh, or with no record left while the ledger
 *   holds the key: swiped away, tapped, or shown at once;
 * - one past its hour that was never seen shown is shown at once: Android
 *   drops a one-off alarm whose hour passes with the phone off, and never
 *   brings it back. A tray emptied by a restart before any refresh saw it
 *   shows it twice, which costs less than a certificate missed. One that no
 *   longer applies is cancelled instead: Android may still be about to
 *   deliver it;
 * - one due that Android never had is scheduled, or shown at once if its hour
 *   has passed: a phone opened late, or a certificate added after its hour.
 *
 * The ledger forgets a key a fortnight after it last mattered.
 */
export function planReminders(
  due: readonly DueReminder[],
  kept: readonly PendingNotification[],
  delivered: readonly number[],
  told: ToldLedger,
  now: number,
): ReminderPlan {
  const inTray = new Set(delivered);
  const records = new Map<string, { id: number; at: number; fingerprint: string | undefined }>();
  for (const notification of kept) {
    const extra = notification.extra;
    if (typeof extra?.key === 'string' && typeof extra.at === 'number') {
      records.set(extra.key, { id: notification.id, at: extra.at, fingerprint: extra.fingerprint });
    }
  }
  const dueByKey = new Map(due.map((reminder) => [reminder.key, reminder]));
  const plan: ReminderPlan = { cancel: [], schedule: [], told: {} };
  for (const [key, entry] of Object.entries(told)) {
    if (now - entry.seen < FORGET_AFTER_MS) {
      plan.told[key] = entry;
    }
  }

  const tell = (reminder: DueReminder): void => {
    plan.schedule.push(notificationOf(reminder, now));
    plan.told[reminder.key] = { shown: false, seen: now };
  };
  const forget = (key: string, id: number): void => {
    plan.cancel.push(id);
    delete plan.told[key];
  };

  for (const key of new Set([...records.keys(), ...dueByKey.keys()])) {
    const record = records.get(key);
    const reminder = dueByKey.get(key);
    const entry = plan.told[key];

    if (record !== undefined && record.at > now) {
      if (reminder === undefined) {
        forget(key, record.id);
      } else if (record.fingerprint !== fingerprintOf(reminder)) {
        plan.cancel.push(record.id);
        tell(reminder);
      } else {
        plan.told[key] = { shown: false, seen: now };
      }
    } else if (record !== undefined) {
      if (inTray.has(record.id) || entry?.shown === true) {
        plan.told[key] = { shown: true, seen: now };
      } else if (reminder === undefined) {
        forget(key, record.id);
      } else {
        plan.cancel.push(record.id);
        tell(reminder);
      }
    } else if (entry !== undefined) {
      plan.told[key] = { shown: true, seen: reminder === undefined ? entry.seen : now };
    } else if (reminder !== undefined) {
      tell(reminder);
    }
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

function notificationOf(reminder: DueReminder, now: number): LocalNotification {
  const at = Date.parse(reminder.at);
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
    extra: { key: reminder.key, at, fingerprint: fingerprintOf(reminder), link: reminder.link },
  };
}

function fingerprintOf(reminder: DueReminder): string {
  const at = Date.parse(reminder.at);
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
