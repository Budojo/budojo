import { describe, expect, it, vi } from 'vitest';

import {
  DesktopNotifier,
  EMPTY_LEDGER,
  parseListOutput,
  planDelivery,
  queryAfter,
  type DeliveryLedger,
  type PendingNotification,
} from './desktop-notifier.js';

/**
 * Native toasts (#1225): each owner notification row shows exactly once, across
 * restarts, and the query window never loses a same-second row.
 */

const row = (id: string, at: string, kind = 'medical_cert_expiry_reminders'): PendingNotification => ({
  id,
  created_at: at,
  title: `t-${id}`,
  body: 'b',
  link: '/dashboard/documents/expiring',
  kind,
});

describe('planDelivery', () => {
  it('delivers everything on a fresh ledger and records it', () => {
    const rows = [row('a', '2026-08-15T09:00:00+00:00'), row('b', '2026-08-15T09:10:00+00:00')];

    const { toDeliver, nextLedger } = planDelivery(rows, EMPTY_LEDGER);

    expect(toDeliver.map((r) => r.id)).toEqual(['a', 'b']);
    expect(nextLedger).toEqual({ watermark: '2026-08-15T09:10:00+00:00', delivered: ['a', 'b'] });
  });

  it('never shows a row twice — the restart case', () => {
    // After a restart the query window overlaps the watermark by a second, so
    // the newest row comes back; the delivered list is what stops the repeat.
    const ledger: DeliveryLedger = { watermark: '2026-08-15T09:10:00+00:00', delivered: ['a', 'b'] };
    const rows = [row('b', '2026-08-15T09:10:00+00:00'), row('c', '2026-08-15T09:10:00+00:00')];

    const { toDeliver, nextLedger } = planDelivery(rows, ledger);

    expect(toDeliver.map((r) => r.id)).toEqual(['c']);
    expect(nextLedger.delivered).toEqual(['a', 'b', 'c']);
    expect(nextLedger.watermark).toBe('2026-08-15T09:10:00+00:00');
  });

  it('advances the watermark even when nothing new is delivered', () => {
    const ledger: DeliveryLedger = { watermark: '2026-08-15T09:00:00+00:00', delivered: ['a'] };

    const { toDeliver, nextLedger } = planDelivery([row('a', '2026-08-15T09:00:00+00:00')], ledger);

    expect(toDeliver).toEqual([]);
    expect(nextLedger.watermark).toBe('2026-08-15T09:00:00+00:00');
  });

  it('caps the delivered list so the ledger cannot grow for years', () => {
    const many = Array.from({ length: 600 }, (_, i) => row(`n${i}`, `2026-08-15T09:${String(i % 60).padStart(2, '0')}:00+00:00`));

    const { nextLedger } = planDelivery(many, EMPTY_LEDGER);

    expect(nextLedger.delivered).toHaveLength(500);
    expect(nextLedger.delivered.at(-1)).toBe('n599');
  });
});

describe('queryAfter', () => {
  it('looks a day back on the very first poll', () => {
    expect(queryAfter(EMPTY_LEDGER, new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-14T10:00:00.000Z');
  });

  it('overlaps the watermark by one second afterwards', () => {
    // A row committed in the watermark's second, after the previous poll,
    // must still be fetched; the ledger dedupes the overlap.
    expect(queryAfter({ watermark: '2026-08-15T09:10:00+00:00', delivered: [] }, new Date())).toBe(
      '2026-08-15T09:09:59.000Z',
    );
  });
});

describe('DesktopNotifier', () => {
  function make(rows: PendingNotification[], initial: DeliveryLedger = EMPTY_LEDGER) {
    let stored = initial;
    const shown: PendingNotification[] = [];
    const list = vi.fn(async () => rows);
    const notifier = new DesktopNotifier({
      list,
      show: (n) => shown.push(n),
      ledger: {
        read: async () => stored,
        write: async (ledger) => {
          stored = ledger;
        },
      },
      log: () => undefined,
      now: () => new Date('2026-08-15T10:00:00Z'),
    });
    return { notifier, shown, list, stored: () => stored };
  }

  it('shows each new row once and persists the ledger', async () => {
    const { notifier, shown, list, stored } = make([row('a', '2026-08-15T09:00:00+00:00')]);

    expect(await notifier.poll()).toBe(1);
    expect(shown.map((n) => n.id)).toEqual(['a']);
    expect(list).toHaveBeenCalledWith('2026-08-14T10:00:00.000Z');
    expect(stored().delivered).toEqual(['a']);

    // Second poll returns the same row (overlap window): nothing shown again.
    expect(await notifier.poll()).toBe(0);
    expect(shown).toHaveLength(1);
    expect(list).toHaveBeenLastCalledWith('2026-08-15T08:59:59.000Z');
  });

  it('shows nothing and writes nothing when there is nothing', async () => {
    const write = vi.fn(async () => undefined);
    const notifier = new DesktopNotifier({
      list: async () => [],
      show: () => undefined,
      ledger: { read: async () => EMPTY_LEDGER, write },
      log: () => undefined,
    });

    expect(await notifier.poll()).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('parseListOutput', () => {
  it('reads the JSON array the command prints', () => {
    const out = '[{"id":"u1","created_at":"2026-08-15T09:00:00+00:00","title":"t","body":"b","link":"/x","kind":"k"}]\n';
    expect(parseListOutput(out).map((r) => r.id)).toEqual(['u1']);
  });

  it('survives a PHP warning line before the JSON and garbage after', () => {
    const out = 'PHP Warning: something\n[{"id":"u1","created_at":"2026-08-15T09:00:00+00:00","title":"t","body":"b","link":"/x","kind":"k"}]\n';
    expect(parseListOutput(out)).toHaveLength(1);
    expect(parseListOutput('not json at all')).toEqual([]);
  });

  it('drops malformed entries instead of toasting undefined', () => {
    const out = '[{"id":"u1"},{"id":"u2","created_at":"2026-08-15T09:00:00+00:00","title":"t","body":"b","link":"/x","kind":"k"}]';
    expect(parseListOutput(out).map((r) => r.id)).toEqual(['u2']);
  });
});
