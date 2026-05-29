import { InboxNotification } from '../../core/services/notification-inbox.service';

export type NotificationGroupKey = 'new' | 'today' | 'week' | 'earlier';

export interface NotificationGroup {
  readonly key: NotificationGroupKey;
  readonly items: readonly InboxNotification[];
}

/**
 * Buckets the inbox for the page (#1129): unread rows surface in a single
 * "Nuove" group (newest first, whatever their age); read rows fall into
 * Oggi / Questa settimana / Prima by `created_at`, so a row is never shown
 * twice. `now` is injected so the buckets are unit-testable without
 * freezing the clock.
 */
export function groupNotifications(
  rows: readonly InboxNotification[],
  unreadOnly: boolean,
  now: Date = new Date(),
): readonly NotificationGroup[] {
  const unread = rows.filter((r) => r.read_at === null);

  if (unreadOnly) {
    return unread.length > 0 ? [{ key: 'new', items: unread }] : [];
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000; // today + the 6 prior days

  const today: InboxNotification[] = [];
  const week: InboxNotification[] = [];
  const earlier: InboxNotification[] = [];

  for (const row of rows) {
    if (row.read_at === null) {
      continue; // unread rows live in the "Nuove" group only
    }
    const at = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (at >= startOfToday) {
      today.push(row);
    } else if (at >= sevenDaysAgo) {
      week.push(row);
    } else {
      earlier.push(row);
    }
  }

  const groups: NotificationGroup[] = [];
  if (unread.length > 0) groups.push({ key: 'new', items: unread });
  if (today.length > 0) groups.push({ key: 'today', items: today });
  if (week.length > 0) groups.push({ key: 'week', items: week });
  if (earlier.length > 0) groups.push({ key: 'earlier', items: earlier });
  return groups;
}
