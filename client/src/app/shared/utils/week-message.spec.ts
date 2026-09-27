import type { AcademyClass } from '../../core/services/academy-class.service';
import type { AcademyClosure } from '../../core/services/academy.service';
import { CalendarLesson, SyllabusCalendar } from '../../core/services/stats.service';
import {
  WeekMessageLabels,
  WeekSchedule,
  clockOf,
  publishedWeek,
  weekMessageText,
} from './week-message';

/** The local time the message is built at: before any class of the day. */
const MORNING = '08:00';

const LABELS: WeekMessageLabels = {
  heading: 'Programma della settimana',
  weekdays: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
  closed: 'chiuso',
  closedUntil: (lastDay) => `Chiuso fino al ${lastDay}`,
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

describe('the week plan as a message (#1863, #1940)', () => {
  it('prints a heading and one line per planned lesson, days in date order and classes by time', () => {
    const text = weekMessageText(
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
        'Lun 12 · 19:00 Fondamentali · Half guard: Knee shield, Lockdown',
        'Mer 14 · 19:00 Fondamentali · Half guard: Knee shield',
        'Mer 14 · 20:30 Avanzati · Back: Bow and arrow choke',
        'Ven 16 · 19:00 No-gi · Leg entanglements',
      ].join('\n'),
    );
  });

  it('groups techniques under their position, positions in programme order', () => {
    const text = weekMessageText(
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
      'Lun 12 · 19:00 Fondamentali · Half guard: Knee shield, Lockdown; Back: Bow and arrow choke',
    );
  });

  it('prints a position tagged on its own as the position alone', () => {
    const text = weekMessageText(
      calendar([lesson({ id: 1, topics: [{ id: 2, name: 'Half guard', parent_id: null }] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Lun 12 · 19:00 Fondamentali · Half guard');
  });

  it('prints a position once when the lesson names it and one of its techniques', () => {
    const text = weekMessageText(
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

    expect(text?.split('\n')[1]).toBe('Lun 12 · 19:00 Fondamentali · Half guard: Knee shield');
  });

  it('prints a technique whose position has left the programme on its own', () => {
    const text = weekMessageText(
      calendar([lesson({ id: 1, topics: [{ id: 91, name: 'Worm guard sweep', parent_id: 9 }] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Lun 12 · 19:00 Fondamentali · Worm guard sweep');
  });

  it('leaves out what was already held or never confirmed, and other weeks', () => {
    const text = weekMessageText(
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
      ['Programma della settimana', 'Mer 14 · 19:00 Fondamentali · Back: Bow and arrow choke'].join(
        '\n',
      ),
    );
  });

  it('yields no text for a week with nothing planned', () => {
    expect(weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS)).toBeNull();
    expect(
      weekMessageText(
        calendar([lesson({ id: 1, state: 'held', topics: [KNEE_SHIELD] })]),
        '2026-10-12',
        MORNING,
        LABELS,
      ),
    ).toBeNull();
  });

  it('prints a class with no time after the timed ones of its day', () => {
    const text = weekMessageText(
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
      'Mer 14 · 20:30 Fondamentali · Half guard: Knee shield',
      'Mer 14 · Open mat · Half guard: Lockdown',
    ]);
  });

  it("leaves out today's class once it has started, and keeps a later one", () => {
    const text = weekMessageText(
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
      'Mer 14 · 20:30 Avanzati · Back: Bow and arrow choke',
      'Ven 16 · 19:00 Fondamentali · Half guard: Lockdown',
    ]);
  });

  it('names a Sunday lesson with the last weekday', () => {
    const text = weekMessageText(
      calendar([lesson({ id: 1, held_on: '2026-10-18', name: 'Open mat', topics: [LOCKDOWN] })]),
      '2026-10-12',
      MORNING,
      LABELS,
    );

    expect(text?.split('\n')[1]).toBe('Dom 18 · 19:00 Open mat · Half guard: Lockdown');
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

function klass(over: Partial<AcademyClass> & { id: number; weekday: number }): AcademyClass {
  return {
    name: 'Fondamentali',
    starts_at: '19:00',
    duration_minutes: 60,
    kind: 'gi',
    ...over,
  };
}

function closure(over: Partial<AcademyClosure> & { starts_on: string }): AcademyClosure {
  return { id: 1, ends_on: over.starts_on, label: null, ...over };
}

/** Monday and Friday Fondamentali at 19:00, Monday Avanzati at 20:30, Wednesday untimed open mat. */
const TIMETABLE: WeekSchedule = {
  classes: [
    klass({ id: 7, weekday: 1 }),
    klass({ id: 8, weekday: 1, name: 'Avanzati', starts_at: '20:30' }),
    klass({ id: 9, weekday: 3, name: 'Open mat', starts_at: null }),
    klass({ id: 10, weekday: 5 }),
  ],
  closures: [],
};

describe('the week as the timetable has it (#1940)', () => {
  it('prints every scheduled class with its time, in day and time order, topics where planned', () => {
    const text = weekMessageText(
      calendar([lesson({ id: 1, academy_class_id: 7, topics: [KNEE_SHIELD] })]),
      '2026-10-12',
      MORNING,
      LABELS,
      TIMETABLE,
    );

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Lun 12 · 19:00 Fondamentali · Half guard: Knee shield',
      'Lun 12 · 20:30 Avanzati',
      'Mer 14 · Open mat',
      'Ven 16 · 19:00 Fondamentali',
    ]);
  });

  it('prints a class nobody planned yet, so Friday never reads as "no class"', () => {
    const text = weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS, {
      classes: [klass({ id: 10, weekday: 5 })],
      closures: [],
    });

    expect(text?.split('\n')).toEqual(['Programma della settimana', 'Ven 16 · 19:00 Fondamentali']);
  });

  it('prints a closed day once, with its label, and none of its classes', () => {
    const text = weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS, {
      ...TIMETABLE,
      closures: [closure({ starts_on: '2026-10-14', label: 'Immacolata' })],
    });

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Lun 12 · 19:00 Fondamentali',
      'Lun 12 · 20:30 Avanzati',
      'Mer 14 · chiuso — Immacolata',
      'Ven 16 · 19:00 Fondamentali',
    ]);
  });

  it('says nothing about a closed day that had no class anyway', () => {
    const text = weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS, {
      classes: [klass({ id: 7, weekday: 1 })],
      closures: [closure({ starts_on: '2026-10-13' })],
    });

    expect(text?.split('\n')).toEqual(['Programma della settimana', 'Lun 12 · 19:00 Fondamentali']);
  });

  it('prints a closed day with no label as just closed', () => {
    const text = weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS, {
      classes: [klass({ id: 7, weekday: 1 }), klass({ id: 10, weekday: 5 })],
      closures: [closure({ starts_on: '2026-10-16' })],
    });

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Lun 12 · 19:00 Fondamentali',
      'Ven 16 · chiuso',
    ]);
  });

  it('prints a closure over the whole week as one line, to its last day', () => {
    const text = weekMessageText(calendar([]), '2026-10-12', MORNING, LABELS, {
      ...TIMETABLE,
      closures: [closure({ starts_on: '2026-10-10', ends_on: '2026-10-25', label: 'Vacanze' })],
    });

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Chiuso fino al 2026-10-25 — Vacanze',
    ]);
  });

  it('prints a closure over the rest of the week as one line too', () => {
    // Wednesday morning: Monday is behind, Wednesday to Sunday all closed.
    const text = weekMessageText(calendar([], '2026-10-14'), '2026-10-12', MORNING, LABELS, {
      ...TIMETABLE,
      closures: [closure({ starts_on: '2026-10-14', ends_on: '2026-11-02' })],
    });

    expect(text?.split('\n')).toEqual(['Programma della settimana', 'Chiuso fino al 2026-11-02']);
  });

  it('keeps a single day off as a day line, even on the last class day of the week', () => {
    // Wednesday morning: only Friday's class is left, and Friday is a holiday.
    const text = weekMessageText(calendar([], '2026-10-14'), '2026-10-12', MORNING, LABELS, {
      classes: [klass({ id: 7, weekday: 1 }), klass({ id: 10, weekday: 5 })],
      closures: [closure({ starts_on: '2026-10-16', label: 'Festa' })],
    });

    expect(text?.split('\n')).toEqual(['Programma della settimana', 'Ven 16 · chiuso — Festa']);
  });

  it('leaves out the classes already behind, today included once they started', () => {
    // Monday 20:00: the 19:00 class has started, the 20:30 one is still ahead.
    const text = weekMessageText(calendar([]), '2026-10-12', '20:00', LABELS, TIMETABLE);

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Lun 12 · 20:30 Avanzati',
      'Mer 14 · Open mat',
      'Ven 16 · 19:00 Fondamentali',
    ]);
  });

  it('leaves out a class already checked into, even before its time', () => {
    const text = weekMessageText(
      calendar([lesson({ id: 1, academy_class_id: 7, state: 'held', topics: [KNEE_SHIELD] })]),
      '2026-10-12',
      MORNING,
      LABELS,
      { classes: [klass({ id: 7, weekday: 1 }), klass({ id: 10, weekday: 5 })], closures: [] },
    );

    expect(text?.split('\n')).toEqual(['Programma della settimana', 'Ven 16 · 19:00 Fondamentali']);
  });

  it('keeps a planned lesson with no class of its own, on its own day', () => {
    const text = weekMessageText(
      calendar([
        lesson({
          id: 5,
          academy_class_id: null,
          held_on: '2026-10-17',
          starts_at: '10:00',
          name: 'Seminario',
          topics: [LOCKDOWN],
        }),
      ]),
      '2026-10-12',
      MORNING,
      LABELS,
      { classes: [klass({ id: 10, weekday: 5 })], closures: [] },
    );

    expect(text?.split('\n')).toEqual([
      'Programma della settimana',
      'Ven 16 · 19:00 Fondamentali',
      'Sab 17 · 10:00 Seminario · Half guard: Lockdown',
    ]);
  });

  it('yields no text when the rest of the week has nothing on', () => {
    // Sunday evening, no Sunday class.
    expect(
      weekMessageText(calendar([], '2026-10-18'), '2026-10-12', '21:30', LABELS, TIMETABLE),
    ).toBeNull();
  });
});

describe('which week the message is for, with the timetable (#1940)', () => {
  it('is this week while a class is still ahead, planned or not', () => {
    expect(publishedWeek(calendar([], '2026-10-14'), MORNING, TIMETABLE)).toEqual({
      kind: 'week',
      week: '2026-10-12',
    });
  });

  it('is next week on Sunday evening, once the last class is behind', () => {
    expect(publishedWeek(calendar([], '2026-10-18'), '21:30', TIMETABLE)).toEqual({
      kind: 'week',
      week: '2026-10-19',
    });
  });

  it('is next week even when it is all closed: the closure is the news', () => {
    expect(
      publishedWeek(calendar([], '2026-10-18'), '21:30', {
        ...TIMETABLE,
        closures: [closure({ starts_on: '2026-10-19', ends_on: '2026-10-25' })],
      }),
    ).toEqual({ kind: 'week', week: '2026-10-19' });
  });

  it('is none for an academy with no classes and nothing planned', () => {
    expect(
      publishedWeek(calendar([], '2026-10-14'), MORNING, { classes: [], closures: [] }),
    ).toEqual({ kind: 'none' });
  });
});

describe('the clock the message reads (#1863)', () => {
  it('is the local time as HH:MM', () => {
    expect(clockOf(new Date(2026, 9, 14, 9, 5))).toBe('09:05');
    expect(clockOf(new Date(2026, 9, 14, 21, 30))).toBe('21:30');
  });
});
