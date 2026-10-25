import { PendingNotification } from './local-notifications';
import { DueReminder, planReminders, reminderId } from './phone-reminders';

/**
 * The diff between the reminders handed to Android and the reminders due
 * (#2047): what to cancel, what to schedule, and which keys have been told.
 */
describe('planReminders', () => {
  const NOW = Date.parse('2026-05-04T10:00:00+02:00');

  const due = (key: string, at: string, over: Partial<DueReminder> = {}): DueReminder => ({
    key,
    at,
    title: 'Un certificato medico sta per scadere',
    body: 'Anna Rossi',
    link: '/dashboard/documents/expiring',
    ...over,
  });

  /** What Android keeps of a reminder handed to it earlier: the plan's own fingerprint. */
  const kept = (reminder: DueReminder): PendingNotification => {
    const [handed] = planReminders([reminder], [], [], NOW - 86_400_000).schedule;
    return { id: handed.id, extra: handed.extra };
  };

  const certs = due('medical-certificates:2026-05-07', '2026-05-07T09:00:00+02:00');
  const unpaid = due('unpaid:2026-05', '2026-05-16T09:00:00+02:00', {
    title: 'Un atleta non ha ancora pagato la quota di maggio',
    body: 'Marco Bianchi',
    link: '/dashboard/athletes?paid=no',
  });

  it('schedules a reminder still to come at its time, inexact, on the reminders channel', () => {
    const plan = planReminders([certs], [], [], NOW);

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
    expect(plan.handed).toEqual(['medical-certificates:2026-05-07']);
  });

  it('leaves alone a reminder already scheduled with the same words and time', () => {
    const plan = planReminders([certs, unpaid], [kept(certs), kept(unpaid)], [], NOW);

    expect(plan.cancel).toEqual([]);
    expect(plan.schedule).toEqual([]);
    expect(plan.handed).toEqual(['medical-certificates:2026-05-07', 'unpaid:2026-05']);
  });

  it('cancels a reminder that no longer applies: the fee got paid on the PC', () => {
    const plan = planReminders([certs], [kept(certs), kept(unpaid)], [], NOW);

    expect(plan.cancel).toEqual([reminderId('unpaid:2026-05')]);
    expect(plan.schedule).toEqual([]);
    expect(plan.handed).toEqual(['medical-certificates:2026-05-07']);
  });

  it('replaces a reminder whose words changed: another athlete owes the month', () => {
    const more = {
      ...unpaid,
      title: '2 atleti non hanno ancora pagato',
      body: 'Marco Bianchi, Luca Verdi',
    };

    const plan = planReminders([more], [kept(unpaid)], [], NOW);

    expect(plan.cancel).toEqual([reminderId('unpaid:2026-05')]);
    expect(plan.schedule.map((n) => [n.id, n.body])).toEqual([
      [reminderId('unpaid:2026-05'), 'Marco Bianchi, Luca Verdi'],
    ]);
  });

  it('shows now a reminder of today past its hour that was never handed to Android', () => {
    const late = due('academy-documents:2026-05-04', '2026-05-04T09:00:00+02:00');

    const [shown] = planReminders([late], [], [], NOW).schedule;

    expect(shown.schedule).toBeUndefined();
    expect(shown.extra?.at).toBe(Date.parse('2026-05-04T09:00:00+02:00'));
  });

  it('never tells twice: a reminder shown and swiped away, or shown and still in the tray', () => {
    const late = due('academy-documents:2026-05-04', '2026-05-04T09:00:00+02:00');

    const swiped = planReminders([late], [], ['academy-documents:2026-05-04'], NOW);
    const inTheTray = planReminders([late], [kept(late)], [], NOW);

    expect(swiped.schedule).toEqual([]);
    expect(swiped.handed).toEqual(['academy-documents:2026-05-04']);
    expect(inTheTray.schedule).toEqual([]);
    expect(inTheTray.cancel).toEqual([]);
  });

  it('tells a missed streak once, though each day dates it to that morning', () => {
    const yesterday = due('missed-streak:7:2026-04-24', '2026-05-03T09:30:00+02:00');
    const today = due('missed-streak:7:2026-04-24', '2026-05-04T09:30:00+02:00');

    expect(planReminders([today], [kept(yesterday)], [], NOW).schedule).toEqual([]);
    expect(planReminders([today], [], ['missed-streak:7:2026-04-24'], NOW).schedule).toEqual([]);
  });

  it('never takes back a reminder already shown, even one no longer due', () => {
    const shown = due('medical-certificates:2026-05-03', '2026-05-03T09:00:00+02:00');

    expect(planReminders([], [kept(shown)], [], NOW).cancel).toEqual([]);
  });

  it('forgets the keys no longer due, so the ledger never grows', () => {
    const plan = planReminders(
      [certs],
      [],
      ['medical-certificates:2026-05-01', 'unpaid:2026-04'],
      NOW,
    );

    expect(plan.handed).toEqual(['medical-certificates:2026-05-07']);
  });

  it('leaves alone a notification that is not a reminder', () => {
    const plan = planReminders([], [{ id: 42, extra: null }], [], NOW);

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
