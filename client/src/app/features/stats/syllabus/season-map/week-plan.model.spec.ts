import { CalendarLesson, SyllabusCalendar } from '../../../../core/services/stats.service';
import { WeekPlanLabels, clockOf, publishedWeek, weekPlanText } from './week-plan.model';

/** The local time the message is built at: before any class of the day. */
const MORNING = '08:00';

const LABELS: WeekPlanLabels = {
  heading: 'Programma della settimana',
  weekdays: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
};

function lesson(over: Partial<CalendarLesson> & { id: number }): CalendarLesson {
  return {
    academy_class_id: 7,
    held_on: '2026-10-12',
    name: 'Fondamentali',
    starts_at: '19:00',
    kind: 'gi',
    state: 'planned',
    position_ids: [],
    topics: [],
    ...over,
  };
}

function calendar(lessons: CalendarLesson[], today = '2026-10-12'): SyllabusCalendar {
  return {
    season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
    kind: null,
    today,
    weeks: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'],
    // Programme order: the order a position's group is printed in.
    positions: [
      { id: 1, name: 'Closed guard', kind: 'both', cells: [] },
      { id: 2, name: 'Half guard', kind: 'both', cells: [] },
      { id: 3, name: 'Back', kind: 'both', cells: [] },
      { id: 4, name: 'Leg entanglements', kind: 'nogi', cells: [] },
    ],
    lessons,
  };
}

const KNEE_SHIELD = { id: 21, name: 'Knee shield', parent_id: 2 };
const LOCKDOWN = { id: 22, name: 'Lockdown', parent_id: 2 };
const BOW_AND_ARROW = { id: 31, name: 'Bow and arrow choke', parent_id: 3 };
const LEG_ENTANGLEMENTS = { id: 4, name: 'Leg entanglements', parent_id: null };

describe('the week plan as a message (#1863)', () => {
  it('prints a heading and one line per planned lesson, days in date order and classes by time', () => {
    const text = weekPlanText(
      calendar([
        lesson({ id: 3, held_on: '2026-10-16', name: 'No-gi', topics: [LEG_ENTANGLEMENTS] }),
        lesson({
          id: 2,
          held_on: '2026-10-14',
          starts_at: '20:30',
          name: 'Avanzati',
          topics: [BOW_AND_ARROW],
        }),
        lesson({ id: 1, held_on: '2026-10-12', topics: [KNEE_SHIELD, LOCKDOWN] }),
        lesson({
          id: 4,
          held_on: '2026-10-14',
          starts_at: '19:00',
          name: 'Fondamentali',
          topics: [KNEE_SHIELD],
        }),
      ]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text).toBe(
      [
        'Programma della settimana',
        'Lun 12 · Fondamentali · Half guard: Knee shield, Lockdown',
        'Mer 14 · Fondamentali · Half guard: Knee shield',
        'Mer 14 · Avanzati · Back: Bow and arrow choke',
        'Ven 16 · No-gi · Leg entanglements',
      ].join('\n'),
    );
  });

  it('groups techniques under their position, positions in programme order', () => {
    const text = weekPlanText(
      calendar([
        lesson({
          id: 1,
          // Out of programme order on the lesson: Back first, then half guard.
          topics: [BOW_AND_ARROW, KNEE_SHIELD, LOCKDOWN],
        }),
      ]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe(
      'Lun 12 · Fondamentali · Half guard: Knee shield, Lockdown; Back: Bow and arrow choke',
    );
  });

  it('prints a position tagged on its own as the position alone', () => {
    const text = weekPlanText(
      calendar([lesson({ id: 1, topics: [{ id: 2, name: 'Half guard', parent_id: null }] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Lun 12 · Fondamentali · Half guard');
  });

  it('prints a position once when the lesson names it and one of its techniques', () => {
    const text = weekPlanText(
      calendar([
        lesson({
          id: 1,
          topics: [{ id: 2, name: 'Half guard', parent_id: null }, KNEE_SHIELD],
        }),
      ]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Lun 12 · Fondamentali · Half guard: Knee shield');
  });

  it('prints a technique whose position has left the programme on its own', () => {
    const text = weekPlanText(
      calendar([lesson({ id: 1, topics: [{ id: 91, name: 'Worm guard sweep', parent_id: 9 }] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Lun 12 · Fondamentali · Worm guard sweep');
  });

  it('leaves out what was already held or never confirmed, and other weeks', () => {
    const text = weekPlanText(
      calendar(
        [
          lesson({ id: 1, held_on: '2026-10-12', state: 'held', topics: [KNEE_SHIELD] }),
          lesson({ id: 2, held_on: '2026-10-13', state: 'unconfirmed', topics: [LOCKDOWN] }),
          lesson({ id: 3, held_on: '2026-10-14', topics: [BOW_AND_ARROW] }),
          lesson({ id: 4, held_on: '2026-10-19', topics: [LEG_ENTANGLEMENTS] }),
        ],
        '2026-10-14',
      ),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text).toBe(
      ['Programma della settimana', 'Mer 14 · Fondamentali · Back: Bow and arrow choke'].join('\n'),
    );
  });

  it('yields no text for a week with nothing planned', () => {
    expect(weekPlanText(calendar([]), '2026-10-12', MORNING, LABELS)).toBeNull();
    expect(
      weekPlanText(
        calendar([lesson({ id: 1, state: 'held', topics: [KNEE_SHIELD] })]),
        '2026-10-12',
        MORNING,
        LABELS,
      ),
    ).toBeNull();
  });

  it('prints a class with no time after the timed ones of its day', () => {
    const text = weekPlanText(
      calendar([
        lesson({
          id: 1,
          held_on: '2026-10-14',
          starts_at: null,
          name: 'Open mat',
          topics: [LOCKDOWN],
        }),
        lesson({ id: 2, held_on: '2026-10-14', starts_at: '20:30', topics: [KNEE_SHIELD] }),
      ]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n').slice(1)).toEqual([
      'Mer 14 · Fondamentali · Half guard: Knee shield',
      'Mer 14 · Open mat · Half guard: Lockdown',
    ]);
  });

  it("leaves out today's class once it has started, and keeps a later one", () => {
    const text = weekPlanText(
      calendar(
        [
          lesson({ id: 1, held_on: '2026-10-14', starts_at: '19:00', topics: [KNEE_SHIELD] }),
          lesson({
            id: 2,
            held_on: '2026-10-14',
            starts_at: '20:30',
            name: 'Avanzati',
            topics: [BOW_AND_ARROW],
          }),
          lesson({ id: 3, held_on: '2026-10-16', topics: [LOCKDOWN] }),
        ],
        '2026-10-14',
      ),
      '2026-10-12',
      '19:45',
      LABELS,
    );

    expect(text?.split('\n').slice(1)).toEqual([
      'Mer 14 · Avanzati · Back: Bow and arrow choke',
      'Ven 16 · Fondamentali · Half guard: Lockdown',
    ]);
  });

  it('names a Sunday lesson with the last weekday', () => {
    const text = weekPlanText(
      calendar([lesson({ id: 1, held_on: '2026-10-18', name: 'Open mat', topics: [LOCKDOWN] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Dom 18 · Open mat · Half guard: Lockdown');
  });
});

describe('which week the message is for (#1863)', () => {
  it('is this week while it still has a plan ahead', () => {
    const week = publishedWeek(
      calendar(
        [
          lesson({ id: 1, held_on: '2026-10-16', topics: [KNEE_SHIELD] }),
          lesson({ id: 2, held_on: '2026-10-19', topics: [LOCKDOWN] }),
        ],
        '2026-10-14',
      ),
      MORNING,
    );

    expect(week).toEqual({ kind: 'week', week: '2026-10-12' });
  });

  it("is next week once this week's plan is behind it — a Sunday-evening message", () => {
    const week = publishedWeek(
      calendar(
        [
          lesson({ id: 1, held_on: '2026-10-16', state: 'held', topics: [KNEE_SHIELD] }),
          lesson({ id: 2, held_on: '2026-10-19', topics: [LOCKDOWN] }),
        ],
        '2026-10-18',
      ),
      MORNING,
    );

    expect(week).toEqual({ kind: 'week', week: '2026-10-19' });
  });

  it('is none when neither this week nor the next has anything planned', () => {
    const week = publishedWeek(
      calendar([lesson({ id: 1, held_on: '2026-10-26', topics: [KNEE_SHIELD] })], '2026-10-14'),
      MORNING,
    );

    expect(week).toEqual({ kind: 'none' });
  });

  it('moves on once the last class of this week is over, though nobody checked in', () => {
    // Sunday evening, after an open mat that stays "planned" until a check-in.
    const sunday = calendar(
      [
        lesson({ id: 1, held_on: '2026-10-18', starts_at: '10:00', topics: [LOCKDOWN] }),
        lesson({ id: 2, held_on: '2026-10-19', topics: [KNEE_SHIELD] }),
      ],
      '2026-10-18',
    );

    expect(publishedWeek(sunday, '21:30')).toEqual({ kind: 'week', week: '2026-10-19' });
    // The same Sunday before the open mat: this week still has it ahead.
    expect(publishedWeek(sunday, '09:00')).toEqual({ kind: 'week', week: '2026-10-12' });
  });

  it('keeps an untimed class of today ahead: nothing says it is over', () => {
    const week = publishedWeek(
      calendar(
        [lesson({ id: 1, held_on: '2026-10-18', starts_at: null, topics: [LOCKDOWN] })],
        '2026-10-18',
      ),
      '21:30',
    );

    expect(week).toEqual({ kind: 'week', week: '2026-10-12' });
  });

  it('says the week ahead opens the new season, which this season’s map does not hold', () => {
    // Season ends on Monday 31 August 2026; Sunday the 30th, this week's plan behind it.
    const lastSunday = {
      ...calendar(
        [
          lesson({ id: 1, held_on: '2026-08-28', state: 'held', topics: [LOCKDOWN] }),
          // In the payload, on the season's last day — the rest of that week is not.
          lesson({ id: 2, held_on: '2026-08-31', topics: [KNEE_SHIELD] }),
        ],
        '2026-08-30',
      ),
      season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' },
    };

    expect(publishedWeek(lastSunday, '21:30')).toEqual({ kind: 'nextSeason' });
  });

  it('says so too when this week itself runs past the end of the season', () => {
    const lastMonday = {
      ...calendar(
        [lesson({ id: 1, held_on: '2026-08-31', starts_at: '19:00', topics: [KNEE_SHIELD] })],
        '2026-08-31',
      ),
      season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' },
    };

    expect(publishedWeek(lastMonday, MORNING)).toEqual({ kind: 'nextSeason' });
  });

  it('publishes a week that ends on the last day of the season', () => {
    const lastWeek = {
      ...calendar([lesson({ id: 1, held_on: '2026-08-26', topics: [KNEE_SHIELD] })], '2026-08-24'),
      season: { start: '2025-09-01', end: '2026-08-30', label: '2025/26' },
    };

    expect(publishedWeek(lastWeek, MORNING)).toEqual({ kind: 'week', week: '2026-08-24' });
  });
});

describe('the clock the message reads (#1863)', () => {
  it('is the local time as HH:MM', () => {
    expect(clockOf(new Date(2026, 9, 14, 9, 5))).toBe('09:05');
    expect(clockOf(new Date(2026, 9, 14, 21, 30))).toBe('21:30');
  });
});
