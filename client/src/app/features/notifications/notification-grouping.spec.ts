import { InboxNotification } from '../../core/services/notification-inbox.service';
import { groupNotifications } from './notification-grouping';

function n(over: Partial<InboxNotification>): InboxNotification {
  return {
    id: '1',
    type: 'x',
    kind: null,
    title: 't',
    body: '',
    link: null,
    actor: null,
    read_at: new Date(2026, 4, 1, 8).toISOString(),
    created_at: new Date(2026, 4, 1, 8).toISOString(),
    ...over,
  };
}

describe('groupNotifications', () => {
  // Local-constructed so the day buckets are TZ-stable in CI.
  const now = new Date(2026, 4, 20, 12);

  it('collects every unread row into a single "new" group, whatever its age', () => {
    const rows = [
      n({ id: 'recent', read_at: null, created_at: new Date(2026, 4, 20, 10).toISOString() }),
      n({ id: 'ancient', read_at: null, created_at: new Date(2026, 0, 1).toISOString() }),
    ];

    const groups = groupNotifications(rows, false, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('new');
    expect(groups[0].items.map((r) => r.id)).toEqual(['recent', 'ancient']);
  });

  it('buckets read rows into today / week / earlier by created_at', () => {
    const rows = [
      n({ id: 'today', created_at: new Date(2026, 4, 20, 8).toISOString() }),
      n({ id: 'week', created_at: new Date(2026, 4, 16, 8).toISOString() }),
      n({ id: 'earlier', created_at: new Date(2026, 3, 1, 8).toISOString() }),
    ];

    const groups = groupNotifications(rows, false, now);

    expect(groups.map((g) => g.key)).toEqual(['today', 'week', 'earlier']);
    expect(groups[0].items[0].id).toBe('today');
  });

  it('returns only the "new" group when unreadOnly is set', () => {
    const rows = [
      n({ id: 'u', read_at: null }),
      n({ id: 'r', created_at: new Date(2026, 4, 20, 8).toISOString() }),
    ];

    const groups = groupNotifications(rows, true, now);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('new');
    expect(groups[0].items.map((r) => r.id)).toEqual(['u']);
  });

  it('omits empty groups', () => {
    expect(groupNotifications([], false, now)).toEqual([]);
    expect(groupNotifications([n({ read_at: null })], false, now).map((g) => g.key)).toEqual([
      'new',
    ]);
  });
});
