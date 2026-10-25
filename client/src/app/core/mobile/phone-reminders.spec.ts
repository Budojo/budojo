import { PendingNotification } from './local-notifications';
import { DueReminder, planReminders, reminderId, ToldLedger } from './phone-reminders';

/**
 * The diff between the reminders handed to Android and the reminders due
 * (#2047): what to cancel, what to schedule, and which keys have been told.
 * What Android keeps is the plugin's: a record per notification until it is
 * swiped away, tapped or cancelled, and the tray, which a restart empties.
 */
describe('planReminders', () => {
  const NOW = Date.parse('2026-05-04T10:00:00+02:00');
  const DAY = 86_400_000;

  const due = (key: string, at: string, over: Partial<DueReminder> = {}): DueReminder => ({
    key,
    at,
    title: 'Un certificato medico sta per scadere',
    body: 'Anna Rossi',
    link: '/dashboard/documents/expiring',
    ...over,
  });

  /** The record Android keeps of a reminder handed to it a day before. */
  const kept = (reminder: DueReminder): PendingNotification => {
    const [handed] = planReminders([reminder], [], [], {}, NOW - 2 * DAY).schedule;
    return { id: handed.id, extra: handed.extra };
  };

  const told = (keys: string[], shown: boolean, seen = NOW - DAY): ToldLedger =>
    Object.fromEntries(keys.map((key) => [key, { shown, seen }]));

  const certs = due('medical-certificates:2026-05-07', '2026-05-07T09:00:00+02:00');
  const unpaid = due('unpaid:2026-05', '2026-05-16T09:00:00+02:00', {
    title: 'Un atleta non ha ancora pagato la quota di maggio',
    body: 'Marco Bianchi',
    link: '/dashboard/athletes?paid=no',
  });
  const late = due('academy-documents:2026-05-04', '2026-05-04T09:00:00+02:00');

  it('schedules a reminder still to come at its time, inexact, on the reminders channel', () => {
    const plan = planReminders([certs], [], [], {}, NOW);

    expect(plan.cancel).toEqual([]);
    expect(plan.schedule).toEqual([
      {
        id: reminderId('medical-certificates:2026-05-07'),
        title: 'Un certificato medico sta per scadere',
        body: 'Anna Rossi',
        largeBody: 'Anna Rossi',
        channelId: 'reminders',
        autoCancel: true,
        isExactNotification: false,
        schedule: { at: new Date('2026-05-07T07:00:00Z'), allowWhileIdle: true },
        extra: {
          key: 'medical-certificates:2026-05-07',
          at: Date.parse('2026-05-07T09:00:00+02:00'),
          fingerprint: expect.any(String),
          link: '/dashboard/documents/expiring',
        },
      },
    ]);
    expect(plan.told).toEqual({ 'medical-certificates:2026-05-07': { shown: false, seen: NOW } });
  });

  it('leaves alone a reminder already scheduled with the same words and time', () => {
    const plan = planReminders(
      [certs, unpaid],
      [kept(certs), kept(unpaid)],
      [],
      told([certs.key, unpaid.key], false),
      NOW,
    );

    expect(plan.cancel).toEqual([]);
    expect(plan.schedule).toEqual([]);
  });

  it('cancels a reminder still to come that no longer applies, and forgets it so it may come back', () => {
    const plan = planReminders(
      [certs],
      [kept(certs), kept(unpaid)],
      [],
      told([certs.key, unpaid.key], false),
      NOW,
    );

    expect(plan.cancel).toEqual([reminderId('unpaid:2026-05')]);
    expect(plan.schedule).toEqual([]);
    expect(Object.keys(plan.told)).toEqual([certs.key]);
  });

  it('replaces a reminder whose words changed: another athlete owes the month', () => {
    const more = { ...unpaid, title: '2 atleti', body: 'Marco Bianchi, Luca Verdi' };

    const plan = planReminders([more], [kept(unpaid)], [], told([unpaid.key], false), NOW);

    expect(plan.cancel).toEqual([reminderId('unpaid:2026-05')]);
    expect(plan.schedule.map((n) => [n.id, n.body])).toEqual([
      [reminderId('unpaid:2026-05'), 'Marco Bianchi, Luca Verdi'],
    ]);
  });

  it('shows now a reminder of today past its hour that was never handed to Android', () => {
    const [shown] = planReminders([late], [], [], {}, NOW).schedule;

    expect(shown.schedule).toBeUndefined();
    expect(shown.extra?.at).toBe(Date.parse('2026-05-04T09:00:00+02:00'));
  });

  it('shows now one whose hour passed with the phone off: Android never brings it back', () => {
    const lost = kept(late);

    const plan = planReminders([late], [lost], [], told([late.key], false), NOW);

    expect(plan.cancel).toEqual([lost.id]);
    expect(plan.schedule.map((n) => [n.id, n.schedule])).toEqual([[lost.id, undefined]]);
  });

  it('cancels one Android has yet to deliver once it no longer applies', () => {
    const waiting = kept(late);

    const plan = planReminders([], [waiting], [], told([late.key], false), NOW);

    expect(plan.cancel).toEqual([waiting.id]);
    expect(plan.schedule).toEqual([]);
    expect(plan.told).toEqual({});
  });

  it('never tells twice: in the tray, swiped away, or seen in the tray before a restart emptied it', () => {
    const shown = kept(late);

    const inTheTray = planReminders([late], [shown], [shown.id], told([late.key], false), NOW);
    const swiped = planReminders([late], [], [], told([late.key], false), NOW);
    const restarted = planReminders([late], [shown], [], told([late.key], true), NOW);

    for (const plan of [inTheTray, swiped, restarted]) {
      expect(plan.cancel).toEqual([]);
      expect(plan.schedule).toEqual([]);
      expect(plan.told[late.key]).toEqual({ shown: true, seen: NOW });
    }
  });

  it('tells a missed streak once, though each day dates it to that morning', () => {
    const yesterday = due('missed-streak:7:2026-04-24', '2026-05-03T09:30:00+02:00');
    const today = due('missed-streak:7:2026-04-24', '2026-05-04T09:30:00+02:00');
    const shown = kept(yesterday);

    expect(planReminders([today], [shown], [shown.id], {}, NOW).schedule).toEqual([]);
    expect(planReminders([today], [], [], told([today.key], false), NOW).schedule).toEqual([]);
  });

  it('never takes back a reminder already shown, even one no longer due', () => {
    const shown = kept(due('medical-certificates:2026-05-03', '2026-05-03T09:00:00+02:00'));

    expect(planReminders([], [shown], [shown.id], {}, NOW).cancel).toEqual([]);
  });

  it('remembers a reminder shown while it is off the list for a while', () => {
    const away = planReminders([], [], [], told([unpaid.key], true), NOW);
    const back = planReminders([unpaid], [], [], away.told, NOW + DAY);

    expect(back.schedule).toEqual([]);
  });

  it('forgets a key a fortnight after it was last due, so the ledger never grows', () => {
    const plan = planReminders(
      [certs],
      [],
      [],
      {
        ...told(['unpaid:2026-04'], true, NOW - 15 * DAY),
        ...told(['birthdays:2026-05-01'], true),
      },
      NOW,
    );

    expect(Object.keys(plan.told).sort()).toEqual(['birthdays:2026-05-01', certs.key]);
  });

  it('leaves alone a notification that is not a reminder', () => {
    const plan = planReminders([], [{ id: 42, extra: null }], [42], {}, NOW);

    expect(plan.cancel).toEqual([]);
  });
});

describe('reminderId', () => {
  it('is the same number for the same key, and a positive Java int', () => {
    const id = reminderId('unpaid:2026-05');

    expect(reminderId('unpaid:2026-05')).toBe(id);
    expect(reminderId('unpaid:2026-06')).not.toBe(id);
    expect(Number.isInteger(id) && id >= 0 && id <= 2 ** 31 - 1).toBe(true);
  });
});
